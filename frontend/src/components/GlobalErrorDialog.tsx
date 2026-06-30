// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
import { UiButton } from '@/components/ui';
import { AlertCircle, ChevronDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface GlobalErrorDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string;
  copyText?: string;
  onClose: () => void;
}

export function GlobalErrorDialog({
  isOpen,
  title,
  message,
  details,
  copyText,
  onClose,
}: GlobalErrorDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const rawErrorText = [message, details, copyText].filter(Boolean).join('\n\n');
  const isOpenRouterConfigError = /OPENROUTER_API_KEY|API key not set/i.test(rawErrorText);
  const displayTitle = isOpenRouterConfigError
    ? t('errorDialog.serviceConfigTitle')
    : title;
  const displayMessage = isOpenRouterConfigError
    ? t('errorDialog.openRouterConfigMessage')
    : message;
  const technicalDetails = useMemo(() => {
    const detailText = details?.trim();
    const messageText = message.trim();
    if (!detailText || detailText === messageText) {
      return detailText || undefined;
    }
    return detailText;
  }, [details, message]);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShowDetails(false);
    }
  }, [isOpen]);

  const handleCopy = useCallback(async () => {
    const payload = copyText || [message, details].filter(Boolean).join('\n\n');
    if (!payload) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('Failed to copy global error text', error);
    }
  }, [copyText, details, message]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/62 backdrop-blur-[2px]"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <section className="relative w-full max-w-[600px] overflow-hidden rounded-[18px] border border-white/[0.16] bg-[#17191f]/95 shadow-[0_28px_80px_rgba(0,0,0,0.62)]">
        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-text-muted">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-6 text-text-dark">{displayTitle}</h2>
              <p className="mt-2 text-[14px] leading-6 text-text-dark/78">{displayMessage}</p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/24 text-text-muted transition-colors hover:bg-white/[0.08] hover:text-text-dark"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        {technicalDetails && (
          <div className="border-t border-white/[0.08] px-5 py-3">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-[8px] px-1 py-1 text-left text-[12px] font-medium text-text-muted transition-colors hover:text-text-dark"
              onClick={() => setShowDetails((value) => !value)}
            >
              <span>{t('errorDialog.technicalDetails')}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {showDetails && (
              <pre className="ui-scrollbar mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-white/[0.12] bg-[#0f1116]/80 p-3 font-mono text-[12px] leading-5 text-text-dark/82">
                {technicalDetails}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/[0.08] px-5 py-4">
          <UiButton
            variant="ghost"
            size="sm"
            className="rounded-[8px] px-3 text-text-dark/82 hover:bg-white/[0.07]"
            onClick={() => {
              void handleCopy();
            }}
          >
            {copied ? t('nodeToolbar.copied') : t('errorDialog.copyReport')}
          </UiButton>
          <UiButton
            variant="primary"
            size="sm"
            className="rounded-[8px] bg-cyan-900/70 px-4 text-white hover:bg-cyan-800/80"
            onClick={onClose}
          >
            {t('common.close')}
          </UiButton>
        </div>
      </section>
    </div>
  );
}
