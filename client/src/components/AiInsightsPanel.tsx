import React from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { trpc } from '../lib/trpc';

interface AiInsightsPanelProps {
  fileUploadId: number;
  currencySymbol: string;
}

function renderFormattedLine(line: string, index: number) {
  // Render bold markdown segments (**...**) cleanly without raw asterisks
  const parts = line.split(/(\*\*.*?\*\*)/g);
  return (
    <p key={index} className="insight-paragraph">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}

export const AiInsightsPanel: React.FC<AiInsightsPanelProps> = ({
  fileUploadId,
  currencySymbol,
}) => {
  const utils = trpc.useUtils();
  const { data: analysis, isLoading } = trpc.finance.getAnalysis.useQuery(
    { fileUploadId },
    { enabled: Boolean(fileUploadId) }
  );

  const generateMutation = trpc.finance.generateInsights.useMutation({
    onSuccess: async () => {
      await utils.finance.getAnalysis.invalidate({ fileUploadId });
    },
  });

  const insightsText = generateMutation.data?.insights ?? analysis?.insights;
  const paragraphs = insightsText
    ? insightsText
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <section className="surface-card" aria-label="AI Financial Analyst Insights">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Sparkles size={17} style={{ color: 'var(--accent-primary)' }} />
            AI Financial Analyst Advisory
          </h2>
          <p className="card-subtitle">
            Automated spending pattern diagnostics, cash flow efficiency &amp; capital allocation guidance
          </p>
        </div>

        <button
          id="generate-ai-insights-btn"
          type="button"
          className="btn btn-primary"
          disabled={generateMutation.isPending || isLoading}
          onClick={() =>
            generateMutation.mutate({
              fileUploadId,
              currencySymbol,
            })
          }
        >
          <RefreshCw
            size={14}
            style={{
              animation: generateMutation.isPending
                ? 'spin 1s linear infinite'
                : undefined,
            }}
          />
          {generateMutation.isPending
            ? 'Synthesizing Insights...'
            : paragraphs.length > 0
              ? 'Refresh AI Analysis'
              : 'Generate AI Insights'}
        </button>
      </div>

      <div className="card-body">
        {paragraphs.length > 0 ? (
          <div className="insights-box">
            {paragraphs.map((p, idx) => renderFormattedLine(p, idx))}
          </div>
        ) : (
          <div className="insights-box" style={{ textAlign: 'center', padding: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Click <strong>Generate AI Insights</strong> to run an executive analysis on this statement’s cash flow, category concentration, and savings rate.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
