import { NextRequest, NextResponse } from 'next/server';
import { validateEmailBatch } from '@/lib/email-validator';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emails } = body as { emails: string[] };

    if (!emails || !Array.isArray(emails)) {
      return NextResponse.json(
        { error: 'Invalid request: emails array required' },
        { status: 400 }
      );
    }

    if (emails.length === 0) {
      return NextResponse.json(
        { error: 'No emails provided' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent timeout (increased with domain caching optimization)
    const maxBatchSize = 5000;
    if (emails.length > maxBatchSize) {
      return NextResponse.json(
        { error: `Batch too large. Maximum ${maxBatchSize} emails per request.` },
        { status: 400 }
      );
    }

    const results = await validateEmailBatch(emails);

    const summary = {
      total: results.length,
      valid: results.filter(r => r.status === 'valid').length,
      invalid: results.filter(r => r.status === 'invalid').length,
      risky: results.filter(r => r.status === 'risky').length,
    };

    return NextResponse.json({
      success: true,
      summary,
      results,
    });
  } catch (error) {
    console.error('Verification error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Verification failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Email verification API. Send POST request with { emails: string[] }' 
  });
}
