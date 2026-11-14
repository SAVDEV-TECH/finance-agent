import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Sparkles, Loader2 } from 'lucide-react';
import { trpc } from '../lib/trpc';

interface StatementUploaderProps {
  onUploadSuccess: (fileUploadId: number) => void;
}

const SAMPLE_STATEMENT_CSV = `Date,Description,Amount,Account
2026-10-01,STRIPE PAYOUT - CONSULTING RETAINER,7200.00,Mercury Checking
2026-10-03,BILT REWARDS APARTMENT RENT,-2450.00,Mercury Checking
2026-10-05,TRADER JOES #108 GROCERY,-164.80,Chase Sapphire
2026-10-08,VERIZON FIBER GIGABIT INTERNET,-79.99,Chase Sapphire
2026-10-11,ANTHROPIC CLAUDE PRO SUBSCRIPTION,-20.00,Chase Sapphire
2026-10-14,SCHWAB S&P 500 DIVIDEND DISTRIBUTION,385.40,Charles Schwab
2026-10-17,DELTA AIR LINES SFO-JFK FLIGHT,-418.20,Chase Sapphire
2026-10-21,EQUINOX FITNESS MONTHLY MEMBERSHIP,-260.00,Chase Sapphire
2026-10-25,SWEETGREEN & BLUE BOTTLE COFFEE,-54.75,Chase Sapphire
2026-10-28,WHOLE FOODS MARKET ORGANIC,-192.30,Chase Sapphire
2026-11-01,STRIPE PAYOUT - CONSULTING RETAINER,7200.00,Mercury Checking
2026-11-03,BILT REWARDS APARTMENT RENT,-2450.00,Mercury Checking
2026-11-07,APPLE STORE MACBOOK ACCESSORY,-129.00,Chase Sapphire
2026-11-10,GEICO AUTO INSURANCE PREMIUM,-145.00,Mercury Checking`;

function detectFileType(
  fileName: string
): 'csv' | 'xlsx' | 'docx' | 'pdf' | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'docx') return 'docx';
  if (ext === 'pdf') return 'pdf';
  return null;
}

export const StatementUploader: React.FC<StatementUploaderProps> = ({
  onUploadSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const uploadMutation = trpc.finance.uploadFile.useMutation({
    onSuccess: async (data) => {
      setStatusMessage({
        type: 'success',
        text: `Imported ${data.transactionCount} transactions.`,
      });
      await utils.finance.getFileUploads.invalidate();
      onUploadSuccess(data.fileUploadId);
    },
    onError: (err) => {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to parse statement file.',
      });
    },
  });

  const handleFile = async (file: File) => {
    setStatusMessage(null);
    const fileType = detectFileType(file.name);
    if (!fileType) {
      setStatusMessage({
        type: 'error',
        text: 'Unsupported format. Please upload a .csv, .xlsx, .docx, or .pdf statement.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        uploadMutation.mutate({
          fileName: file.name,
          fileContent: result,
          fileType,
          fileEncoding: 'base64',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImportSample = () => {
    setStatusMessage(null);
    const base64 = window.btoa(
      unescape(encodeURIComponent(SAMPLE_STATEMENT_CSV))
    );
    uploadMutation.mutate({
      fileName: `Consulting-CashFlow-Oct-Nov-2026.csv`,
      fileContent: base64,
      fileType: 'csv',
      fileEncoding: 'base64',
    });
  };

  return (
    <div className="surface-card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <FileSpreadsheet size={17} />
            Import Statement
          </h2>
          <p className="card-subtitle">CSV, Excel (.xlsx), Word (.docx), or PDF</p>
        </div>
      </div>

      <div className="card-body">
        <div
          id="statement-dropzone"
          role="button"
          tabIndex={0}
          className={`dropzone ${isDragging ? 'active' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          {uploadMutation.isPending ? (
            <Loader2 size={24} style={{ margin: '0 auto', color: 'var(--accent-primary)' }} />
          ) : (
            <Upload size={22} style={{ margin: '0 auto', color: 'var(--accent-primary)' }} />
          )}
          <div className="dropzone-title">
            {uploadMutation.isPending
              ? 'Parsing & classifying transactions...'
              : 'Drop bank statement or click to browse'}
          </div>
          <div className="dropzone-hint">
            Automatic column detection &amp; hybrid AI categorization (max 10MB)
          </div>
          <input
            ref={fileInputRef}
            id="statement-file-input"
            type="file"
            accept=".csv,.xlsx,.xls,.docx,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        <button
          id="load-sample-statement-btn"
          type="button"
          className="btn btn-secondary"
          style={{ width: '100%', marginTop: '0.75rem' }}
          disabled={uploadMutation.isPending}
          onClick={handleImportSample}
        >
          <Sparkles size={15} />
          Load Sample Statement (CSV)
        </button>

        {statusMessage && (
          <div className={`status-banner ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}
      </div>
    </div>
  );
};
