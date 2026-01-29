// ============================================================================
// TOPIC / INTENT CANON GATE - SERVICE OWNERSHIP VALIDATION
// ============================================================================
// 
// Prevents the planner from generating content for services/topics 
// the business does NOT offer.
//
// IMPORTANT: 
// - Services like "research and publishing" ARE VALID if present in onboarding.services[]
// - Only blocks services/topics NOT in services[] or declared allowedExpansions[]
// ============================================================================

import { GrowthTask, GrowthPlanMonth, BusinessRealityModel } from './types';
import { generateOwnershipKey } from './cannibalisation';

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceOwnershipBlocker {
  type: 
    | 'UNOWNED_SERVICE_TOPIC'
    | 'DUPLICATE_OWNERSHIP_KEY_MONEY'
    | 'ORPHAN_SUPPORT_PAGE'
    | 'INVALID_SUPPORT_TYPE';
  taskId: string;
  taskTitle: string;
  details: string;
  suggestion: string;
}

export interface ServiceOwnershipResult {
  isValid: boolean;
  blockers: ServiceOwnershipBlocker[];
  warnings: string[];
  validatedTasks: number;
  rejectedTasks: number;
}

export interface OnboardingContext {
  services: string[];
  allowedExpansions?: string[];
  locations?: string[];
}

// Valid support types
const VALID_SUPPORT_TYPES = [
  'faq',
  'process',
  'objection',
  'comparison',
  'trust',
  'case-study',
  'authority',
  'guide',
  'education',
  'pre-sell',
  'local-proof',
] as const;

// ============================================================================
// SERVICE NORMALIZATION
// ============================================================================

/**
 * Normalize a service name for comparison
 * - Lowercase
 * - Trim whitespace
 * - Remove punctuation
 * - Collapse spaces
 */
function normalizeService(service: string): string {
  return service
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ');    // Collapse spaces
}

/**
 * Check if a task's primary service is owned (in onboarding services or allowed expansions)
 */
function isServiceOwned(
  taskService: string,
  onboarding: OnboardingContext
): boolean {
  const normalizedTaskService = normalizeService(taskService);
  
  // Check against core services
  const normalizedServices = onboarding.services.map(normalizeService);
  if (normalizedServices.includes(normalizedTaskService)) {
    return true;
  }
  
  // Check for partial matches (e.g., "wedding photography" matches "photography")
  for (const service of normalizedServices) {
    // Task service contains the onboarded service
    if (normalizedTaskService.includes(service)) {
      return true;
    }
    // Onboarded service contains the task service
    if (service.includes(normalizedTaskService)) {
      return true;
    }
  }
  
  // Check allowed expansions
  if (onboarding.allowedExpansions) {
    const normalizedExpansions = onboarding.allowedExpansions.map(normalizeService);
    if (normalizedExpansions.includes(normalizedTaskService)) {
      return true;
    }
    
    // Partial match for expansions too
    for (const expansion of normalizedExpansions) {
      if (normalizedTaskService.includes(expansion) || expansion.includes(normalizedTaskService)) {
        return true;
      }
    }
  }
  
  return false;
}

// ============================================================================
// SERVICE OWNERSHIP VALIDATION
// ============================================================================

/**
 * Validate that all tasks target services the business actually offers
 */
export function validateServiceOwnership(
  months: GrowthPlanMonth[],
  onboarding: OnboardingContext
): ServiceOwnershipResult {
  const blockers: ServiceOwnershipBlocker[] = [];
  const warnings: string[] = [];
  let validatedTasks = 0;
  let rejectedTasks = 0;

  // If no services defined, warn but don't block
  if (!onboarding.services || onboarding.services.length === 0) {
    warnings.push('No services defined in onboarding - cannot validate service ownership');
    return {
      isValid: true,
      blockers: [],
      warnings,
      validatedTasks: 0,
      rejectedTasks: 0,
    };
  }

  console.log(`[ServiceOwnership] Validating against ${onboarding.services.length} services: ${onboarding.services.join(', ')}`);

  for (const month of months) {
    for (const task of month.tasks) {
      // Check if task's primary service is owned
      if (task.primaryService && !isServiceOwned(task.primaryService, onboarding)) {
        blockers.push({
          type: 'UNOWNED_SERVICE_TOPIC',
          taskId: task.id,
          taskTitle: task.title,
          details: `Service "${task.primaryService}" is not in onboarding services: [${onboarding.services.join(', ')}]`,
          suggestion: `Remove this task or add "${task.primaryService}" to allowed services`,
        });
        rejectedTasks++;
      } else {
        validatedTasks++;
      }
    }
  }

  return {
    isValid: blockers.length === 0,
    blockers,
    warnings,
    validatedTasks,
    rejectedTasks,
  };
}

// ============================================================================
// INTENT CANON VALIDATION
// ============================================================================

/**
 * Validate intent canon rules:
 * 1. Exactly one MONEY page per ownershipKey
 * 2. Support pages must have supportsPageId and valid supportType
 */
export function validateIntentCanon(
  months: GrowthPlanMonth[]
): ServiceOwnershipResult {
  const blockers: ServiceOwnershipBlocker[] = [];
  const warnings: string[] = [];
  let validatedTasks = 0;
  let rejectedTasks = 0;

  // Track money page ownership keys
  const moneyOwnershipKeys = new Map<string, { taskId: string; title: string }>();

  for (const month of months) {
    for (const task of month.tasks) {
      const ownershipKey = task.ownershipKey || generateOwnershipKey(
        task.primaryService,
        task.primaryLocation,
        task.searchIntent
      );

      // ========================================
      // CHECK 1: Money Page Uniqueness
      // ========================================
      if (task.role === 'money') {
        if (moneyOwnershipKeys.has(ownershipKey)) {
          const existing = moneyOwnershipKeys.get(ownershipKey)!;
          blockers.push({
            type: 'DUPLICATE_OWNERSHIP_KEY_MONEY',
            taskId: task.id,
            taskTitle: task.title,
            details: `Ownership key "${ownershipKey}" already used by "${existing.title}"`,
            suggestion: `Merge this money page into "${existing.title}" or differentiate by location/intent`,
          });
          rejectedTasks++;
          continue;
        }
        
        moneyOwnershipKeys.set(ownershipKey, { taskId: task.id, title: task.title });
        validatedTasks++;
        continue;
      }

      // ========================================
      // CHECK 2: Support Pages Must Have Parent
      // ========================================
      if (task.role === 'support' || task.role === 'trust') {
        if (!task.supportsPage) {
          blockers.push({
            type: 'ORPHAN_SUPPORT_PAGE',
            taskId: task.id,
            taskTitle: task.title,
            details: `${task.role} page must have supportsPageId set`,
            suggestion: 'Assign this page to support a money page',
          });
          rejectedTasks++;
          continue;
        }

        // Check supportType is valid
        if (task.supportType && !VALID_SUPPORT_TYPES.includes(task.supportType as any)) {
          blockers.push({
            type: 'INVALID_SUPPORT_TYPE',
            taskId: task.id,
            taskTitle: task.title,
            details: `supportType "${task.supportType}" is not valid`,
            suggestion: `Use one of: ${VALID_SUPPORT_TYPES.join(', ')}`,
          });
          rejectedTasks++;
          continue;
        }
      }

      validatedTasks++;
    }
  }

  return {
    isValid: blockers.length === 0,
    blockers,
    warnings,
    validatedTasks,
    rejectedTasks,
  };
}

// ============================================================================
// COMBINED VALIDATION
// ============================================================================

/**
 * Run both service ownership and intent canon validation
 */
export function validateTopicIntentCanon(
  months: GrowthPlanMonth[],
  onboarding: OnboardingContext
): ServiceOwnershipResult {
  // Run service ownership check
  const ownershipResult = validateServiceOwnership(months, onboarding);
  
  // Run intent canon check
  const intentResult = validateIntentCanon(months);
  
  // Combine results
  return {
    isValid: ownershipResult.isValid && intentResult.isValid,
    blockers: [...ownershipResult.blockers, ...intentResult.blockers],
    warnings: [...ownershipResult.warnings, ...intentResult.warnings],
    validatedTasks: ownershipResult.validatedTasks + intentResult.validatedTasks,
    rejectedTasks: ownershipResult.rejectedTasks + intentResult.rejectedTasks,
  };
}
