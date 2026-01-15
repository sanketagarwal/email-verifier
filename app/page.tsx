'use client';

import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';

type EmailStatus = 'valid' | 'invalid' | 'risky';

interface EmailResult {
  email: string;
  status: EmailStatus;
  reason: string;
  suggestion?: string;
}

interface ProcessingState {
  status: 'idle' | 'parsing' | 'verifying' | 'complete' | 'error';
  progress: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}

interface Summary {
  total: number;
  valid: number;
  invalid: number;
  risky: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [emailColumn, setEmailColumn] = useState<string>('');
  const [columns, setColumns] = useState<string[]>([]);
  const [processing, setProcessing] = useState<ProcessingState>({
    status: 'idle',
    progress: 0,
    total: 0,
    currentBatch: 0,
    totalBatches: 0,
  });
  const [results, setResults] = useState<EmailResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalData, setOriginalData] = useState<Record<string, string>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setResults([]);
    setSummary(null);
    setProcessing({ status: 'parsing', progress: 0, total: 0, currentBatch: 0, totalBatches: 0 });

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || [];
        setColumns(headers);
        setOriginalData(result.data as Record<string, string>[]);
        
        // Auto-detect email column
        const emailCol = headers.find(h => 
          h.toLowerCase() === 'email' || 
          h.toLowerCase() === 'e-mail' ||
          h.toLowerCase() === 'emailaddress' ||
          h.toLowerCase() === 'email_address'
        );
        
        if (emailCol) {
          setEmailColumn(emailCol);
        }
        
        setProcessing(prev => ({ ...prev, status: 'idle', total: result.data.length }));
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setProcessing(prev => ({ ...prev, status: 'error' }));
      }
    });
  }, []);

  const startVerification = async () => {
    if (!emailColumn || originalData.length === 0) {
      setError('Please select the email column');
      return;
    }

    setError(null);
    setResults([]);
    
    const emails = originalData
      .map(row => row[emailColumn])
      .filter(email => email && email.trim().length > 0);

    if (emails.length === 0) {
      setError('No emails found in the selected column');
      return;
    }

    const batchSize = 500;
    const batches = [];
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push(emails.slice(i, i + batchSize));
    }

    setProcessing({
      status: 'verifying',
      progress: 0,
      total: emails.length,
      currentBatch: 0,
      totalBatches: batches.length,
    });

    const allResults: EmailResult[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        const response = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: batches[i] }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Verification failed');
        }

        const data = await response.json();
        allResults.push(...data.results);

        setProcessing(prev => ({
          ...prev,
          progress: Math.min((i + 1) * batchSize, emails.length),
          currentBatch: i + 1,
        }));
      }

      setResults(allResults);
      setSummary({
        total: allResults.length,
        valid: allResults.filter(r => r.status === 'valid').length,
        invalid: allResults.filter(r => r.status === 'invalid').length,
        risky: allResults.filter(r => r.status === 'risky').length,
      });
      setProcessing(prev => ({ ...prev, status: 'complete' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setProcessing(prev => ({ ...prev, status: 'error' }));
    }
  };

  const downloadResults = (filter?: EmailStatus) => {
    let dataToExport = originalData.map(row => {
      const email = row[emailColumn];
      const result = results.find(r => r.email === email?.toLowerCase());
      return {
        ...row,
        verification_status: result?.status || 'unknown',
        verification_reason: result?.reason || '',
        suggestion: result?.suggestion || '',
      };
    });

    if (filter) {
      dataToExport = dataToExport.filter(row => row.verification_status === filter);
    }

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filter ? `emails_${filter}.csv` : 'emails_verified.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setFile(null);
    setEmailColumn('');
    setColumns([]);
    setProcessing({ status: 'idle', progress: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    setResults([]);
    setSummary(null);
    setError(null);
    setOriginalData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logoContainer}>
            <div style={styles.logo}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="10" fill="url(#grad1)" />
                <path d="M10 15L20 22L30 15M10 25L20 32L30 25" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="20" cy="12" r="3" fill="white" />
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="40" y2="40">
                    <stop stopColor="#3b82f6" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <h1 style={styles.title}>Email Verifier</h1>
              <p style={styles.subtitle}>Validate & Clean Your Email List</p>
            </div>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>⚠️</span>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={styles.errorClose}>×</button>
          </div>
        )}

        {/* Upload Section */}
        {processing.status === 'idle' && !file && (
          <section style={styles.uploadSection}>
            <div
              style={styles.dropzone}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile && droppedFile.name.endsWith('.csv')) {
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(droppedFile);
                  if (fileInputRef.current) {
                    fileInputRef.current.files = dataTransfer.files;
                    fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }}
            >
              <div style={styles.dropzoneIcon}>
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                  <rect x="8" y="16" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M32 8V32M32 8L24 16M32 8L40 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 style={styles.dropzoneTitle}>Drop your CSV file here</h3>
              <p style={styles.dropzoneText}>or click to browse</p>
              <p style={styles.dropzoneHint}>Supports files up to 50MB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </section>
        )}

        {/* Column Selection */}
        {file && processing.status === 'idle' && columns.length > 0 && !summary && (
          <section style={styles.configSection}>
            <div style={styles.fileInfo}>
              <div style={styles.fileIcon}>📄</div>
              <div>
                <p style={styles.fileName}>{file.name}</p>
                <p style={styles.fileStats}>{originalData.length.toLocaleString()} rows • {columns.length} columns</p>
              </div>
              <button onClick={resetAll} style={styles.resetButton}>✕</button>
            </div>

            <div style={styles.columnSelect}>
              <label style={styles.label}>Select Email Column</label>
              <select
                value={emailColumn}
                onChange={(e) => setEmailColumn(e.target.value)}
                style={styles.select}
              >
                <option value="">-- Select column --</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {emailColumn && (
              <div style={styles.previewBox}>
                <p style={styles.previewTitle}>Preview (first 5 emails)</p>
                <div style={styles.previewList}>
                  {originalData.slice(0, 5).map((row, i) => (
                    <div key={i} style={styles.previewItem}>
                      {row[emailColumn] || '(empty)'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={startVerification}
              disabled={!emailColumn}
              style={{
                ...styles.primaryButton,
                opacity: emailColumn ? 1 : 0.5,
                cursor: emailColumn ? 'pointer' : 'not-allowed',
              }}
            >
              <span style={styles.buttonIcon}>🚀</span>
              Start Verification
            </button>
          </section>
        )}

        {/* Processing State */}
        {(processing.status === 'parsing' || processing.status === 'verifying') && (
          <section style={styles.processingSection}>
            <div style={styles.spinner} />
            <h3 style={styles.processingTitle}>
              {processing.status === 'parsing' ? 'Parsing CSV...' : 'Verifying Emails...'}
            </h3>
            {processing.status === 'verifying' && (
              <>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${(processing.progress / processing.total) * 100}%`,
                    }}
                  />
                </div>
                <p style={styles.progressText}>
                  {processing.progress.toLocaleString()} / {processing.total.toLocaleString()} emails
                  <span style={styles.batchText}>
                    (Batch {processing.currentBatch} of {processing.totalBatches})
                  </span>
                </p>
              </>
            )}
          </section>
        )}

        {/* Results Section */}
        {summary && (
          <section style={styles.resultsSection}>
            <h2 style={styles.resultsTitle}>✅ Verification Complete</h2>
            
            {/* Summary Cards */}
            <div style={styles.summaryGrid}>
              <div style={{ ...styles.summaryCard, borderColor: 'var(--accent-blue)' }}>
                <div style={styles.summaryNumber}>{summary.total.toLocaleString()}</div>
                <div style={styles.summaryLabel}>Total Emails</div>
              </div>
              <div style={{ ...styles.summaryCard, borderColor: 'var(--accent-green)' }}>
                <div style={{ ...styles.summaryNumber, color: 'var(--accent-green)' }}>
                  {summary.valid.toLocaleString()}
                </div>
                <div style={styles.summaryLabel}>Valid</div>
                <div style={styles.summaryPercent}>
                  {((summary.valid / summary.total) * 100).toFixed(1)}%
                </div>
              </div>
              <div style={{ ...styles.summaryCard, borderColor: 'var(--accent-red)' }}>
                <div style={{ ...styles.summaryNumber, color: 'var(--accent-red)' }}>
                  {summary.invalid.toLocaleString()}
                </div>
                <div style={styles.summaryLabel}>Invalid</div>
                <div style={styles.summaryPercent}>
                  {((summary.invalid / summary.total) * 100).toFixed(1)}%
                </div>
              </div>
              <div style={{ ...styles.summaryCard, borderColor: 'var(--accent-yellow)' }}>
                <div style={{ ...styles.summaryNumber, color: 'var(--accent-yellow)' }}>
                  {summary.risky.toLocaleString()}
                </div>
                <div style={styles.summaryLabel}>Risky</div>
                <div style={styles.summaryPercent}>
                  {((summary.risky / summary.total) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Download Buttons */}
            <div style={styles.downloadSection}>
              <h3 style={styles.downloadTitle}>Download Results</h3>
              <div style={styles.downloadButtons}>
                <button onClick={() => downloadResults()} style={styles.downloadButton}>
                  <span>📥</span> All Results
                </button>
                <button onClick={() => downloadResults('valid')} style={{ ...styles.downloadButton, borderColor: 'var(--accent-green)' }}>
                  <span>✅</span> Valid Only ({summary.valid.toLocaleString()})
                </button>
                <button onClick={() => downloadResults('invalid')} style={{ ...styles.downloadButton, borderColor: 'var(--accent-red)' }}>
                  <span>❌</span> Invalid Only ({summary.invalid.toLocaleString()})
                </button>
                <button onClick={() => downloadResults('risky')} style={{ ...styles.downloadButton, borderColor: 'var(--accent-yellow)' }}>
                  <span>⚠️</span> Risky Only ({summary.risky.toLocaleString()})
                </button>
              </div>
            </div>

            {/* Sample Results Table */}
            <div style={styles.tableSection}>
              <h3 style={styles.tableTitle}>Sample Results (First 100)</h3>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Reason</th>
                      <th style={styles.th}>Suggestion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 100).map((result, i) => (
                      <tr key={i} style={styles.tr}>
                        <td style={styles.td}>
                          <code style={styles.emailCode}>{result.email}</code>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            backgroundColor: result.status === 'valid' 
                              ? 'rgba(16, 185, 129, 0.2)'
                              : result.status === 'invalid'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)',
                            color: result.status === 'valid'
                              ? 'var(--accent-green)'
                              : result.status === 'invalid'
                              ? 'var(--accent-red)'
                              : 'var(--accent-yellow)',
                          }}>
                            {result.status}
                          </span>
                        </td>
                        <td style={styles.td}>{result.reason}</td>
                        <td style={styles.td}>
                          {result.suggestion && (
                            <code style={styles.suggestionCode}>{result.suggestion}</code>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* New Verification Button */}
            <button onClick={resetAll} style={styles.newButton}>
              <span>🔄</span> Verify Another File
            </button>
          </section>
        )}

        {/* Footer */}
        <footer style={styles.footer}>
          <p>Email verification powered by DNS/MX lookup & pattern analysis</p>
          <p style={styles.footerNote}>
            Note: This tool validates syntax, domain existence, and detects disposable emails. 
            For 100% mailbox verification, SMTP verification would be required.
          </p>
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    padding: '40px 20px',
  },
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
  },
  logo: {
    animation: 'float 3s ease-in-out infinite',
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    margin: 0,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '12px',
    marginBottom: '24px',
    color: 'var(--accent-red)',
  },
  errorIcon: {
    fontSize: '20px',
  },
  errorClose: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: 'var(--accent-red)',
    fontSize: '24px',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  uploadSection: {
    animation: 'fadeIn 0.5s ease-out',
  },
  dropzone: {
    border: '2px dashed var(--border-color)',
    borderRadius: '16px',
    padding: '60px 40px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    background: 'var(--bg-card)',
  },
  dropzoneIcon: {
    color: 'var(--text-muted)',
    marginBottom: '20px',
  },
  dropzoneTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  dropzoneText: {
    color: 'var(--text-secondary)',
    marginBottom: '8px',
  },
  dropzoneHint: {
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  configSection: {
    background: 'var(--bg-card)',
    borderRadius: '16px',
    padding: '32px',
    border: '1px solid var(--border-color)',
    animation: 'fadeIn 0.5s ease-out',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    background: 'var(--bg-tertiary)',
    borderRadius: '12px',
    marginBottom: '24px',
  },
  fileIcon: {
    fontSize: '32px',
  },
  fileName: {
    fontWeight: 600,
    margin: 0,
  },
  fileStats: {
    color: 'var(--text-secondary)',
    fontSize: '13px',
    margin: 0,
  },
  resetButton: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '8px',
    transition: 'all 0.2s',
  },
  columnSelect: {
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontWeight: 500,
    marginBottom: '8px',
    color: 'var(--text-secondary)',
  },
  select: {
    width: '100%',
    padding: '14px 16px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontSize: '15px',
    cursor: 'pointer',
    outline: 'none',
  },
  previewBox: {
    background: 'var(--bg-tertiary)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
  },
  previewTitle: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '12px',
  },
  previewList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  previewItem: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    color: 'var(--text-secondary)',
    padding: '6px 10px',
    background: 'var(--bg-secondary)',
    borderRadius: '6px',
  },
  primaryButton: {
    width: '100%',
    padding: '16px 24px',
    background: 'var(--gradient-primary)',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'all 0.3s ease',
  },
  buttonIcon: {
    fontSize: '20px',
  },
  processingSection: {
    textAlign: 'center',
    padding: '60px 40px',
    background: 'var(--bg-card)',
    borderRadius: '16px',
    border: '1px solid var(--border-color)',
    animation: 'fadeIn 0.5s ease-out',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '3px solid var(--border-color)',
    borderTopColor: 'var(--accent-blue)',
    borderRadius: '50%',
    margin: '0 auto 24px',
    animation: 'spin 1s linear infinite',
  },
  processingTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '24px',
  },
  progressBar: {
    height: '8px',
    background: 'var(--bg-tertiary)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  progressFill: {
    height: '100%',
    background: 'var(--gradient-primary)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
  },
  batchText: {
    color: 'var(--text-muted)',
    marginLeft: '8px',
  },
  resultsSection: {
    animation: 'fadeIn 0.5s ease-out',
  },
  resultsTitle: {
    fontSize: '28px',
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: '32px',
    background: 'var(--gradient-success)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '40px',
  },
  summaryCard: {
    background: 'var(--bg-card)',
    borderRadius: '16px',
    padding: '24px',
    textAlign: 'center',
    border: '1px solid var(--border-color)',
    borderLeftWidth: '4px',
  },
  summaryNumber: {
    fontSize: '36px',
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--accent-blue)',
    marginBottom: '4px',
  },
  summaryLabel: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  summaryPercent: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginTop: '4px',
  },
  downloadSection: {
    background: 'var(--bg-card)',
    borderRadius: '16px',
    padding: '32px',
    marginBottom: '32px',
    border: '1px solid var(--border-color)',
  },
  downloadTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '20px',
    textAlign: 'center',
  },
  downloadButtons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
  },
  downloadButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '14px 20px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tableSection: {
    background: 'var(--bg-card)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '32px',
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
  },
  tableTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '16px',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontSize: '11px',
    borderBottom: '1px solid var(--border-color)',
  },
  tr: {
    borderBottom: '1px solid var(--border-color)',
  },
  td: {
    padding: '12px 16px',
    verticalAlign: 'middle',
  },
  emailCode: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    background: 'var(--bg-tertiary)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  suggestionCode: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: 'var(--accent-cyan)',
    background: 'rgba(6, 182, 212, 0.1)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  newButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    maxWidth: '300px',
    margin: '0 auto',
    padding: '16px 24px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    color: 'var(--text-primary)',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  footer: {
    textAlign: 'center',
    marginTop: '48px',
    padding: '24px',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  footerNote: {
    marginTop: '8px',
    fontSize: '12px',
    maxWidth: '600px',
    margin: '8px auto 0',
    lineHeight: 1.5,
  },
};
