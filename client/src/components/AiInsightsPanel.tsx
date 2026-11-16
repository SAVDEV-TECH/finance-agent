import React, { useState } from 'react';
import { Sparkles, RefreshCw, Send, MessageSquare } from 'lucide-react';
import { trpc } from '../lib/trpc';

interface AiInsightsPanelProps {
  fileUploadId: number;
  currencySymbol: string;
}

const SUGGESTED_QUESTIONS = [
  'What are my largest expense categories?',
  'Can I afford a $1,200 purchase right now?',
  'Show my groceries and dining transactions',
  'How is my current savings rate?',
];

function renderFormattedLine(line: string, index: number) {
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
  const [question, setQuestion] = useState('');
  const [qaHistory, setQaHistory] = useState<
    Array<{ q: string; a: string }>
  >([]);

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

  const askMutation = trpc.finance.askAgent.useMutation({
    onSuccess: (data, variables) => {
      setQaHistory((prev) => [
        { q: variables.question, a: data.answer },
        ...prev.slice(0, 4),
      ]);
      setQuestion('');
    },
  });

  const handleAsk = (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate({
      fileUploadId,
      question: trimmed,
      currencySymbol,
    });
  };

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
            AI Financial Agent &amp; Interactive Advisor
          </h2>
          <p className="card-subtitle">
            Generate executive spending diagnostics or ask the agent any question about your live ledger
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
          <RefreshCw size={14} />
          {generateMutation.isPending
            ? 'Synthesizing Insights...'
            : paragraphs.length > 0
              ? 'Recalculate AI Insights'
              : 'Generate AI Insights'}
        </button>
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {paragraphs.length > 0 ? (
          <div className="insights-box">
            {paragraphs.map((p, idx) => renderFormattedLine(p, idx))}
          </div>
        ) : (
          <div className="insights-box" style={{ textAlign: 'center', padding: '1.25rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Click <strong>Generate AI Insights</strong> above to run a full diagnostic on this ledger’s cash flow and spending drivers.
            </p>
          </div>
        )}

        {/* Interactive Ask the Agent Prompt Bar */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            <MessageSquare size={15} style={{ color: 'var(--accent-primary)' }} />
            Ask AI Agent About Your Ledger
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {SUGGESTED_QUESTIONS.map((sq) => (
              <button
                key={sq}
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.28rem 0.65rem' }}
                disabled={askMutation.isPending}
                onClick={() => handleAsk(sq)}
              >
                {sq}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(question);
            }}
            style={{ display: 'flex', gap: '0.5rem' }}
          >
            <input
              id="ask-agent-input"
              type="text"
              className="input-control"
              style={{ flex: 1 }}
              placeholder="Ask anything (e.g., 'Can I afford a $800 flight?', 'How much did I spend on utilities?')..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button
              id="ask-agent-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={askMutation.isPending || !question.trim()}
            >
              <Send size={14} />
              {askMutation.isPending ? 'Analyzing...' : 'Ask Agent'}
            </button>
          </form>

          {qaHistory.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.25rem' }}>
              {qaHistory.map((item, idx) => (
                <div
                  key={idx}
                  className="insights-box"
                  style={{ background: 'var(--bg-subtle)', padding: '0.85rem 1rem' }}
                >
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--accent-primary)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Q: {item.q}
                  </div>
                  {item.a
                    .split(/\n\n+/)
                    .map((line, lineIdx) => renderFormattedLine(line, lineIdx))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
