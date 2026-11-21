import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EvidenceInput {
  title: string;
  url: string;
  publisher: string;
  snippet: string;
  date: string | null;
  stance: 'supports' | 'contradicts' | 'neutral';
  relevance: 'high' | 'medium' | 'low';
  sourceType: string;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'must', 'can', 'shall', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'from', 'as', 'into', 'about', 'over', 'after', 'before', 'between',
  'under', 'above', 'it', 'its', 'he', 'she', 'they', 'them', 'their', 'we',
  'our', 'you', 'your', 'i', 'me', 'my', 'his', 'her', 'him', 'us', 'who',
  'whom', 'which', 'what', 'when', 'where', 'why', 'how', 'not', 'no', 'yes',
  'also', 'very', 'just', 'only', 'more', 'most', 'some', 'any', 'each',
  'every', 'all', 'both', 'few', 'other', 'such', 'own', 'same', 'so', 'too',
  's', 't', 'don', 'now', 'said', 'says', 'according', 'there', 'here',
]);

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 400);
}

function keywords(sentence: string): string[] {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const unique = [...new Set(words)];
  return unique.slice(0, 8);
}

function extractClaims(inputType: string, text: string, fileName: string | null): { title: string; claims: string[] } {
  const clean = text.replace(/\s+/g, ' ').trim();
  const source = inputType === 'url' ? `Article from ${fileName ?? 'web page'}` : fileName ?? '';
  const found = sentences(clean);
  const ranked = found
    .map((s) => ({ s, score: claimScore(s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .sort((a, b) => found.indexOf(a.s) - found.indexOf(b.s))
    .map((x) => x.s);
  const title = clean.length > 80 ? clean.slice(0, 80).trim() + '…' : clean || source || 'Untitled input';
  return { title, claims: ranked.length > 0 ? ranked : (clean.length > 30 ? [clean.slice(0, 300)] : []) };
}

function claimScore(sentence: string): number {
  let score = 0;
  if (/\b\d+(\.\d+)?\b/.test(sentence)) score += 2;
  if (/\b(19|20)\d{2}\b/.test(sentence)) score += 2;
  if (/\b(study|studies|research|report|according|found|shows|showed|survey|data|percent|%|million|billion|thousand)\b/i.test(sentence)) score += 2;
  if (/\b(always|never|all|none|every|no one|everyone|proven|fact|impossible|guaranteed)\b/i.test(sentence)) score += 1;
  if (/\b(best|worst|first|largest|smallest|biggest|most|least|leading|number one)\b/i.test(sentence)) score += 1;
  if (/\b(must|should|think|believe|feel|opinion|argue|suggest)\b/i.test(sentence)) score -= 2;
  if (/\?$/.test(sentence)) score -= 3;
  return score;
}

function publisherOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function searchEvidence(query: string, limit: number): Promise<EvidenceInput[]> {
  const urls = [
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=title,abstract,author,issued,URL,container-title&sort=relevance`,
  ];
  const evidence: EvidenceInput[] = [];

  for (const endpoint of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { 'User-Agent': 'TruthLayer/1.0 (fact-verification demo)' },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();

      if (endpoint.includes('duckduckgo')) {
        if (json.AbstractText && json.AbstractURL) {
          evidence.push({
            title: json.Heading || 'Reference',
            url: json.AbstractURL,
            publisher: publisherOf(json.AbstractURL),
            snippet: String(json.AbstractText).slice(0, 500),
            date: null,
            stance: 'neutral',
            relevance: json.AbstractSource ? 'high' : 'medium',
            sourceType: 'reference',
          });
        }
        for (const topic of (json.RelatedTopics ?? []).slice(0, limit)) {
          if (topic.Text && topic.FirstURL) {
            evidence.push({
              title: String(topic.Text).slice(0, 120),
              url: topic.FirstURL,
              publisher: publisherOf(topic.FirstURL),
              snippet: String(topic.Text).slice(0, 500),
              date: null,
              stance: 'neutral',
              relevance: 'low',
              sourceType: 'reference',
            });
          }
        }
      } else {
        for (const item of (json?.message?.items ?? []).slice(0, limit)) {
          const title = Array.isArray(item.title) ? item.title[0] : item.title;
          if (!title || !item.URL) continue;
          const abstract = typeof item.abstract === 'string' ? item.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500) : title;
          const parts = (item.author ?? []).map((a: { family?: string }) => a.family).filter(Boolean).slice(0, 3);
          evidence.push({
            title: String(title).slice(0, 200),
            url: item.URL,
            publisher: Array.isArray(item['container-title']) && item['container-title'][0] ? item['container-title'][0] : publisherOf(item.URL),
            snippet: abstract,
            date: item.issued?.['date-parts']?.[0]?.[0] ? String(item.issued['date-parts'][0][0]) : null,
            stance: 'neutral',
            relevance: 'high',
            sourceType: 'academic',
          });
          void parts;
        }
      }
    } catch {
      continue;
    }
  }

  return evidence.slice(0, limit * 2);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const w of a) if (b.has(w)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function numberStats(text: string): { pct: number[]; years: number[]; counts: number[] } {
  const pct = [...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => parseFloat(m[1]));
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0]));
  const counts = [...text.matchAll(/\b(\d[\d,.]*)\s*(million|billion|thousand)\b/gi)].map((m) => parseFloat(m[1].replace(/,/g, '')));
  return { pct, years, counts };
}

function numberConflict(claim: string, evidence: string): boolean {
  const c = numberStats(claim);
  const e = numberStats(evidence);
  const close = (a: number[], b: number[]) =>
    a.length > 0 && b.length > 0 && !a.some((x) => b.some((y) => Math.abs(x - y) / Math.max(x, y, 1) < 0.15));
  if (close(c.pct, e.pct)) return true;
  if (close(c.counts, e.counts)) return true;
  if (c.years.length > 0 && e.years.length > 0) {
    const overlap = c.years.some((y) => e.years.includes(y));
    if (!overlap && Math.max(...c.years) > 2000) return true;
  }
  return false;
}

function assessClaim(claim: string, evidence: EvidenceInput[]): {
  assessment: 'supported' | 'contradicted' | 'partially_supported' | 'insufficient';
  explanation: string;
  confidence: number;
  stanceByIndex: ('supports' | 'contradicts' | 'neutral')[];
} {
  const claimTokens = tokenize(claim);
  const cNumbers = numberStats(claim);
  const stanceByIndex: ('supports' | 'contradicts' | 'neutral')[] = [];
  let supportScore = 0;
  let contraScore = 0;
  let relevantCount = 0;

  evidence.forEach((ev) => {
    const sim = similarity(claimTokens, tokenize(`${ev.title} ${ev.snippet}`));
    let stance: 'supports' | 'contradicts' | 'neutral' = 'neutral';
    if (sim >= 0.45) {
      relevantCount += 1;
      const conflict = cNumbers.pct.length > 0 || cNumbers.counts.length > 0
        ? numberConflict(claim, ev.snippet)
        : false;
      const hasNumbers = cNumbers.pct.length + cNumbers.counts.length + cNumbers.years.length > 0;
      if (conflict) {
        stance = 'contradicts';
        contraScore += sim + (ev.relevance === 'high' ? 0.3 : 0);
      } else if (sim >= 0.6 && (!hasNumbers || !conflict)) {
        stance = 'supports';
        supportScore += sim + (ev.relevance === 'high' ? 0.3 : 0);
      } else if (sim >= 0.45) {
        stance = 'supports';
        supportScore += sim * 0.7;
      }
    }
    stanceByIndex.push(stance);
  });

  let assessment: 'supported' | 'contradicted' | 'partially_supported' | 'insufficient';
  let confidence: number;
  let explanation: string;

  if (relevantCount === 0) {
    assessment = 'insufficient';
    confidence = 0.25;
    explanation = 'No sufficiently relevant sources were found to evaluate this claim. The available evidence does not directly address its subject matter, so no verdict could be reached.';
  } else if (contraScore > supportScore && contraScore > 0.4) {
    assessment = 'contradicted';
    confidence = Math.min(0.92, 0.5 + contraScore * 0.3);
    explanation = `Relevant sources conflict with this claim. Among ${relevantCount} directly relevant source(s), the details found (figures, dates, or key facts) do not match what the claim states.`;
  } else if (supportScore > 1.0 && contraScore < supportScore * 0.4) {
    assessment = 'supported';
    confidence = Math.min(0.92, 0.55 + supportScore * 0.25);
    explanation = `Relevant sources align with this claim. ${relevantCount} source(s) retrieved discuss the same subject and their reported details are consistent with the claim's key statements.`;
  } else {
    assessment = 'partially_supported';
    confidence = Math.min(0.8, 0.4 + Math.max(supportScore, contraScore) * 0.25);
    explanation = `Evidence is mixed or incomplete for this claim. Some retrieved sources touch on the same subject, but their details only partially confirm the specifics, so treat it as broadly plausible yet unverified.`;
  }

  return { assessment, explanation, confidence, stanceByIndex };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const reportId = body.reportId as string | undefined;
    if (!reportId) {
      return new Response(JSON.stringify({ error: 'reportId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: report, error: reportError } = await supabase
      .from('verification_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();

    if (reportError || !report) {
      return new Response(JSON.stringify({ error: 'Report not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('verification_reports')
      .update({ status: 'processing' })
      .eq('id', reportId);

    const sourceText = (body.text as string) ?? (body.fileContent as string) ?? '';
    const inputType = (body.inputType as string) ?? report.input_type ?? 'text';
    const displaySource = inputType === 'url' ? (body.url as string) ?? report.input_title : report.input_title;
    const { title, claims } = extractClaims(inputType, sourceText, displaySource);

    if (claims.length === 0) {
      await supabase
        .from('verification_reports')
        .update({
          status: 'failed',
          error_message: 'No verifiable factual statements could be extracted from the input.',
          completed_at: new Date().toISOString(),
        })
        .eq('id', reportId);
      return new Response(JSON.stringify({ ok: false, error: 'no claims' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const insertedClaims: { id: string; claim_text: string }[] = [];
    for (let i = 0; i < claims.length; i++) {
      const { data, error } = await supabase
        .from('extracted_claims')
        .insert({ report_id: reportId, claim_text: claims[i], claim_order: i })
        .select('id, claim_text')
        .single();
      if (!error && data) insertedClaims.push(data);
    }

    let supported = 0;
    let contradicted = 0;
    let partial = 0;
    let insufficient = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;
    const summaries: string[] = [];

    for (const claim of insertedClaims) {
      const kws = keywords(claim.claim_text);
      const evidence = await searchEvidence(kws.join(' '), 5);

      const { assessment, explanation, confidence, stanceByIndex } = assessClaim(claim.claim_text, evidence);

      for (let i = 0; i < evidence.length; i++) {
        const ev = evidence[i];
        await supabase.from('evidence_sources').insert({
          claim_id: claim.id,
          source_title: ev.title,
          source_url: ev.url,
          publisher: ev.publisher,
          publication_date: ev.date,
          excerpt: ev.snippet,
          relevance: ev.relevance,
          stance: stanceByIndex[i] ?? ev.stance,
          source_type: ev.sourceType,
        });
      }

      await supabase.from('claim_assessments').insert({
        claim_id: claim.id,
        assessment,
        explanation,
        confidence,
      });

      if (assessment === 'supported') supported += 1;
      else if (assessment === 'contradicted') contradicted += 1;
      else if (assessment === 'partially_supported') partial += 1;
      else insufficient += 1;
      confidenceSum += confidence;
      confidenceCount += 1;
      summaries.push(`${assessment.replace(/_/g, ' ')}: ${claim.claim_text.slice(0, 120)}`);
    }

    const verdictLine =
      contradicted > 0
        ? `${contradicted} claim(s) conflict with the evidence found.`
        : supported > 0
        ? `${supported} claim(s) are consistent with the evidence found.`
        : 'Not enough relevant evidence was found for a clear verdict.';

    const overallSummary =
      `The input "${title}" was broken down into ${insertedClaims.length} verifiable claim(s). ` +
      verdictLine +
      ` In total, ${supported} supported, ${partial} partially supported, ${contradicted} contradicted, and ${insufficient} with insufficient evidence. ` +
      `Key findings: ` +
      summaries.slice(0, 4).join(' | ');

    await supabase
      .from('verification_reports')
      .update({
        status: 'completed',
        input_title: title,
        overall_summary: overallSummary,
        total_claims: insertedClaims.length,
        supported_count: supported,
        contradicted_count: contradicted,
        partial_count: partial,
        insufficient_count: insufficient,
        overall_confidence: confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(3)) : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    return new Response(JSON.stringify({ ok: true, reportId, total: insertedClaims.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
