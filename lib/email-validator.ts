import { DISPOSABLE_DOMAINS, ROLE_BASED_PREFIXES, DOMAIN_TYPOS } from './disposable-domains';

export type EmailStatus = 'valid' | 'invalid' | 'risky';

export interface EmailValidationResult {
  email: string;
  status: EmailStatus;
  reason: string;
  suggestion?: string;
  checks: {
    syntax: boolean;
    mxRecord: boolean;
    disposable: boolean;
    roleBased: boolean;
    typo: boolean;
  };
}

// RFC 5322 compliant email regex (simplified but robust)
const EMAIL_REGEX = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;

// Simpler regex for basic validation
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function checkDisposable(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  return DISPOSABLE_DOMAINS.has(domain);
}

export function checkRoleBased(email: string): boolean {
  const local = email.toLowerCase().split('@')[0];
  return ROLE_BASED_PREFIXES.has(local);
}

export function checkTypo(email: string): string | null {
  const domain = email.toLowerCase().split('@')[1];
  return DOMAIN_TYPOS[domain] || null;
}

export function getDomain(email: string): string {
  return email.toLowerCase().split('@')[1];
}

export async function checkMXRecord(domain: string): Promise<{ exists: boolean; records?: string[] }> {
  try {
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
    const data = await response.json();
    
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      const mxRecords = data.Answer
        .filter((record: { type: number }) => record.type === 15)
        .map((record: { data: string }) => record.data);
      return { exists: mxRecords.length > 0, records: mxRecords };
    }
    
    // Check for A record as fallback (some domains accept mail without MX)
    const aResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
    const aData = await aResponse.json();
    
    if (aData.Status === 0 && aData.Answer && aData.Answer.length > 0) {
      return { exists: true, records: ['A record found (implicit MX)'] };
    }
    
    return { exists: false };
  } catch (error) {
    console.error(`MX lookup failed for ${domain}:`, error);
    return { exists: false };
  }
}

export async function validateEmail(email: string): Promise<EmailValidationResult> {
  const result: EmailValidationResult = {
    email: email.trim().toLowerCase(),
    status: 'valid',
    reason: 'All checks passed',
    checks: {
      syntax: false,
      mxRecord: false,
      disposable: false,
      roleBased: false,
      typo: false,
    },
  };

  // 1. Syntax validation
  const syntaxResult = validateEmailSyntax(email);
  result.checks.syntax = syntaxResult.valid;
  
  if (!syntaxResult.valid) {
    result.status = 'invalid';
    result.reason = syntaxResult.reason || 'Invalid email syntax';
    return result;
  }

  const domain = getDomain(email);

  // 2. Check for typos
  const typoSuggestion = checkTypo(email);
  result.checks.typo = typoSuggestion === null;
  
  if (typoSuggestion) {
    result.status = 'risky';
    result.reason = `Possible typo in domain`;
    result.suggestion = email.split('@')[0] + '@' + typoSuggestion;
    return result;
  }

  // 3. Check for disposable email
  const isDisposable = checkDisposable(email);
  result.checks.disposable = !isDisposable;
  
  if (isDisposable) {
    result.status = 'invalid';
    result.reason = 'Disposable/temporary email address';
    return result;
  }

  // 4. Check for role-based email
  const isRoleBased = checkRoleBased(email);
  result.checks.roleBased = !isRoleBased;
  
  if (isRoleBased) {
    result.status = 'risky';
    result.reason = 'Role-based email address (generic)';
    return result;
  }

  // 5. MX Record check
  const mxResult = await checkMXRecord(domain);
  result.checks.mxRecord = mxResult.exists;
  
  if (!mxResult.exists) {
    result.status = 'invalid';
    result.reason = 'Domain has no mail server (no MX record)';
    return result;
  }

  return result;
}

export async function validateEmailBatch(
  emails: string[],
  onProgress?: (processed: number, total: number) => void
): Promise<EmailValidationResult[]> {
  const results: EmailValidationResult[] = [];
  const total = emails.length;
  
  // Process in batches to avoid overwhelming DNS
  const batchSize = 50;
  
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(validateEmail));
    results.push(...batchResults);
    
    if (onProgress) {
      onProgress(Math.min(i + batchSize, total), total);
    }
    
    // Small delay between batches to be nice to DNS servers
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}
