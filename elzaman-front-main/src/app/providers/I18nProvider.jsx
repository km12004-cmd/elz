import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import I18nContext from './i18nContext';
import { translateLiteral } from '@/features/i18n/lib/translations';

const LANGUAGE_STORAGE_KEY = 'elzaman-language';
const SUPPORTED_LANGUAGES = new Set(['ru', 'en']);
const ATTRIBUTE_NAMES = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIPPED_TAG_NAMES = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (SUPPORTED_LANGUAGES.has(normalized)) return normalized;
  return null;
}

function detectInitialLanguage() {
  if (typeof window === 'undefined') return 'ru';

  const persisted = normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  if (persisted) return persisted;

  const browserLanguage = normalizeLanguage(window.navigator.language?.split('-')[0]);
  if (browserLanguage === 'ru') return 'ru';

  return 'ru';
}

function shouldSkipTextNode(node) {
  if (!node || !(node.parentNode instanceof Element)) return true;
  if (node.parentNode.closest('[data-i18n-skip="true"]')) return true;
  if (SKIPPED_TAG_NAMES.has(node.parentNode.tagName)) return true;
  return false;
}

function splitTextParts(value) {
  const source = typeof value === 'string' ? value : '';
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  const content = source.slice(leading.length, source.length - trailing.length);
  return { leading, trailing, content };
}

function translateTextNode(node, language, originalNodesMap) {
  if (!(node instanceof Text)) return;
  if (shouldSkipTextNode(node)) return;

  if (!originalNodesMap.has(node)) {
    originalNodesMap.set(node, node.nodeValue ?? '');
  }

  const originalValue = originalNodesMap.get(node) ?? '';
  const { leading, trailing, content } = splitTextParts(originalValue);
  if (!content) return;

  const translatedContent = translateLiteral(content, language);
  const nextValue = `${leading}${translatedContent}${trailing}`;
  if (node.nodeValue !== nextValue) {
    node.nodeValue = nextValue;
  }
}

function translateElementAttribute(element, attributeName, language) {
  if (!(element instanceof Element)) return;
  if (!element.hasAttribute(attributeName)) return;
  if (element.closest('[data-i18n-skip="true"]')) return;
  if (SKIPPED_TAG_NAMES.has(element.tagName)) return;

  const originalAttributeName = `data-i18n-orig-${attributeName.replace(/[^a-z0-9-]/gi, '-')}`;
  if (!element.hasAttribute(originalAttributeName)) {
    element.setAttribute(originalAttributeName, element.getAttribute(attributeName) ?? '');
  }

  const originalValue = element.getAttribute(originalAttributeName) ?? '';
  const translatedValue = translateLiteral(originalValue, language);

  if ((element.getAttribute(attributeName) ?? '') !== translatedValue) {
    element.setAttribute(attributeName, translatedValue);
  }
}

function translateTree(root, language, originalNodesMap) {
  if (!root) return;

  if (root instanceof Text) {
    translateTextNode(root, language, originalNodesMap);
    return;
  }

  if (!(root instanceof Element) && !(root instanceof DocumentFragment)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((node) => {
    translateTextNode(node, language, originalNodesMap);
  });

  const attributeQuery = ATTRIBUTE_NAMES.map((name) => `[${name}]`).join(',');
  const candidates = root instanceof Element ? [root, ...root.querySelectorAll(attributeQuery)] : [...root.querySelectorAll(attributeQuery)];

  candidates.forEach((element) => {
    ATTRIBUTE_NAMES.forEach((attributeName) => {
      translateElementAttribute(element, attributeName, language);
    });
  });
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(detectInitialLanguage);
  const originalNodesRef = useRef(new WeakMap());
  const applyingRef = useRef(false);
  const frameRef = useRef(null);

  const locale = language === 'ru' ? 'ru-RU' : 'en-US';

  const setLanguage = useCallback((nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);
    if (!normalized) return;
    setLanguageState(normalized);
  }, []);

  const t = useCallback(
    (key, values) => translateLiteral(String(key ?? ''), language, values),
    [language],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.body;
    if (!root) return undefined;

    const run = () => {
      applyingRef.current = true;
      translateTree(root, language, originalNodesRef.current);
      applyingRef.current = false;
    };

    run();

    const observer = new MutationObserver((mutations) => {
      if (applyingRef.current) return;

      let shouldRun = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          shouldRun = true;
          return;
        }

        if (
          mutation.type === 'attributes' &&
          mutation.attributeName &&
          ATTRIBUTE_NAMES.includes(mutation.attributeName)
        ) {
          shouldRun = true;
        }
      });

      if (!shouldRun) return;

      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => {
        run();
      });
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTE_NAMES,
    });

    return () => {
      observer.disconnect();
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      locale,
      setLanguage,
      t,
      supportedLanguages: ['ru', 'en'],
    }),
    [language, locale, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
