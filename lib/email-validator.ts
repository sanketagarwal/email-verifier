import { DISPOSABLE_DOMAINS, ROLE_BASED_PREFIXES, DOMAIN_TYPOS } from './disposable-domains';

export type EmailStatus = 'valid' | 'invalid' | 'risky';

export interface EmailValidationResult {
  email: string;
  status: EmailStatus;
  reason: string;
  suggestion?: string;
}

// Simpler regex for basic validation
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cache for MX lookups to avoid repeated DNS queries for same domain
const mxCache = new Map<string, boolean>();

export function validateEmailSyntax(email: string): { valid: boolean; reason?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Empty or invalid input' };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length === 0) {
    return { valid: false, reason: 'Empty email' };
  }

  if (trimmed.length > 254) {
    return { valid: false, reason: 'Email too long (max 254 characters)' };
  }

  if (!trimmed.includes('@')) {
    return { valid: false, reason: 'Missing @ symbol' };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Multiple @ symbols' };
  }

  const [local, domain] = parts;

  if (local.length === 0) {
    return { valid: false, reason: 'Empty local part (before @)' };
  }

  if (local.length > 64) {
    return { valid: false, reason: 'Local part too long (max 64 characters)' };
  }

  if (domain.length === 0) {
    return { valid: false, reason: 'Empty domain part (after @)' };
  }

  if (!domain.includes('.')) {
    return { valid: false, reason: 'Domain missing TLD' };
  }

  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) {
    return { valid: false, reason: 'Invalid TLD' };
  }

  if (local.startsWith('.') || local.endsWith('.')) {
    return { valid: false, reason: 'Local part cannot start or end with a dot' };
  }

  if (local.includes('..')) {
    return { valid: false, reason: 'Local part cannot have consecutive dots' };
  }

  if (domain.startsWith('.') || domain.startsWith('-')) {
    return { valid: false, reason: 'Domain cannot start with dot or hyphen' };
  }

  if (domain.endsWith('-')) {
    return { valid: false, reason: 'Domain cannot end with hyphen' };
  }

  if (!SIMPLE_EMAIL_REGEX.test(trimmed)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  return { valid: true };
}

export function checkDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain);
}

export function checkRoleBased(local: string): boolean {
  return ROLE_BASED_PREFIXES.has(local);
}

export function checkTypo(domain: string): string | null {
  return DOMAIN_TYPOS[domain] || null;
}

export async function checkMXRecord(domain: string): Promise<boolean> {
  // Check cache first
  if (mxCache.has(domain)) {
    return mxCache.get(domain)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    
    const data = await response.json();
    
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      const hasMX = data.Answer.some((record: { type: number }) => record.type === 15);
      if (hasMX) {
        mxCache.set(domain, true);
        return true;
      }
    }
    
    // Check for A record as fallback
    const aResponse = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
      { signal: AbortSignal.timeout(2000) }
    );
    const aData = await aResponse.json();
    
    const hasA = aData.Status === 0 && aData.Answer && aData.Answer.length > 0;
    mxCache.set(domain, hasA);
    return hasA;
  } catch (error) {
    // On timeout or error, assume valid to avoid false negatives
    mxCache.set(domain, true);
    return true;
  }
}

export function validateEmailSync(email: string): EmailValidationResult {
  const trimmedEmail = email.trim().toLowerCase();
  
  // 1. Syntax validation
  const syntaxResult = validateEmailSyntax(email);
  if (!syntaxResult.valid) {
    return {
      email: trimmedEmail,
      status: 'invalid',
      reason: syntaxResult.reason || 'Invalid email syntax',
    };
  }

  const [local, domain] = trimmedEmail.split('@');

  // 2. Check for typos
  const typoSuggestion = checkTypo(domain);
  if (typoSuggestion) {
    return {
      email: trimmedEmail,
      status: 'risky',
      reason: 'Possible typo in domain',
      suggestion: `${local}@${typoSuggestion}`,
    };
  }

  // 3. Check for disposable email
  if (checkDisposable(domain)) {
    return {
      email: trimmedEmail,
      status: 'invalid',
      reason: 'Disposable/temporary email address',
    };
  }

  // 4. Check for role-based email
  if (checkRoleBased(local)) {
    return {
      email: trimmedEmail,
      status: 'risky',
      reason: 'Role-based email address (generic)',
    };
  }

  // Return as pending MX check
  return {
    email: trimmedEmail,
    status: 'valid',
    reason: 'Pending MX verification',
  };
}

export async function validateEmailBatch(emails: string[]): Promise<EmailValidationResult[]> {
  // Step 1: Run all sync validations first (very fast)
  const syncResults = emails.map(validateEmailSync);
  
  // Step 2: Collect unique domains that need MX checking
  const domainsToCheck = new Set<string>();
  const validIndices: number[] = [];
  
  syncResults.forEach((result, index) => {
    if (result.status === 'valid' && result.reason === 'Pending MX verification') {
      const domain = result.email.split('@')[1];
      domainsToCheck.add(domain);
      validIndices.push(index);
    }
  });

  // Step 3: Check MX records for unique domains in parallel (with limit)
  const domainArray = Array.from(domainsToCheck);
  const domainResults = new Map<string, boolean>();
  
  // Process domains in batches of 20 to avoid overwhelming DNS
  const batchSize = 20;
  for (let i = 0; i < domainArray.length; i += batchSize) {
    const batch = domainArray.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (domain) => {
      const hasMX = await checkMXRecord(domain);
      return { domain, hasMX };
    }));
    results.forEach(({ domain, hasMX }) => {
      domainResults.set(domain, hasMX);
    });
  }

  // Step 4: Update results based on MX checks
  validIndices.forEach(index => {
    const result = syncResults[index];
    const domain = result.email.split('@')[1];
    const hasMX = domainResults.get(domain);
    
    if (hasMX === false) {
      result.status = 'invalid';
      result.reason = 'Domain has no mail server (no MX record)';
    } else {
      result.reason = 'All checks passed';
    }
  });

  return syncResults;
}
