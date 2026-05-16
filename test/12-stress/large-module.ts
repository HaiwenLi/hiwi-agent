/**
 * large-module.ts — 大型数据处理模块（2000+ 行）
 *
 * 此文件模拟一个大型业务模块，包含数据加载、清洗、变换、聚合、报告等功能。
 * 请在末尾添加 analyzeTrends 函数。
 * 不要修改已有代码。
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ========================================
// 类型定义
// ========================================

export interface DataPoint {
  id: string;
  timestamp: number;
  value: number;
  label: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  confidence?: number;
  weight?: number;
  source?: string;
}

export interface DataBatch {
  batchId: string;
  source: string;
  points: DataPoint[];
  collectedAt: number;
  duration?: number;
  errorCount?: number;
}

export interface AggregationResult {
  label: string;
  sum: number;
  avg: number;
  count: number;
  min: number;
  max: number;
  median: number;
  stddev: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
}

export interface TransformConfig {
  normalize?: boolean;
  removeOutliers?: boolean;
  fillMissing?: 'zero' | 'mean' | 'median' | 'none';
  scale?: number;
  logTransform?: boolean;
  winsorize?: boolean;
  winsorizeLimits?: [number, number];
}

export interface ReportOptions {
  format: 'json' | 'csv' | 'html' | 'markdown';
  includeMetadata: boolean;
  groupBy: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  limit: number;
  title?: string;
  includeCharts?: boolean;
  template?: string;
}

export interface PipelineStep {
  name: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface PipelineConfig {
  name: string;
  steps: PipelineStep[];
  parallel: boolean;
  onError: 'stop' | 'skip' | 'retry';
  maxRetries: number;
}

export interface MetricEntry {
  name: string;
  unit: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: number;
  hits: number;
}

// ========================================
// 工具函数
// ========================================

export function generateId(): string {
  return 'dp-' + randomBytes(8).toString('hex');
}

export function now(): number {
  return Date.now();
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toISOString();
}

export function groupByLabel(points: DataPoint[]): Map<string, DataPoint[]> {
  const groups = new Map<string, DataPoint[]>();
  for (const p of points) {
    const existing = groups.get(p.label) ?? [];
    existing.push(p);
    groups.set(p.label, existing);
  }
  return groups;
}

export function groupByTag(points: DataPoint[], tag: string): Map<string, DataPoint[]> {
  const groups = new Map<string, DataPoint[]>();
  for (const p of points) {
    const t = p.tags.find(t => t.startsWith(tag + ':'));
    const key = t ?? 'untagged';
    const existing = groups.get(key) ?? [];
    existing.push(p);
    groups.set(key, existing);
  }
  return groups;
}

export function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = computeMean(values);
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex').substring(0, 8);
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function sortByValue(points: DataPoint[], order: 'asc' | 'desc' = 'desc'): DataPoint[] {
  return [...points].sort((a, b) => order === 'desc' ? b.value - a.value : a.value - b.value);
}

export function sortByTimestamp(points: DataPoint[], order: 'asc' | 'desc' = 'asc'): DataPoint[] {
  return [...points].sort((a, b) => order === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);
}

export function sampleData(points: DataPoint[], rate: number): DataPoint[] {
  if (rate >= 1) return points;
  return points.filter(() => Math.random() < rate);
}

export function mergeBatches(batches: DataBatch[]): DataBatch {
  const allPoints: DataPoint[] = [];
  for (const b of batches) {
    allPoints.push(...b.points);
  }
  return {
    batchId: 'merged-' + Date.now(),
    source: batches.map(b => b.source).join(','),
    points: allPoints,
    collectedAt: Date.now(),
  };
}

export function deduplicateById(points: DataPoint[]): DataPoint[] {
  const seen = new Map<string, DataPoint>();
  for (const p of points) {
    if (!seen.has(p.id) || seen.get(p.id)!.timestamp < p.timestamp) {
      seen.set(p.id, p);
    }
  }
  return Array.from(seen.values());
}

export function filterByConfidence(points: DataPoint[], minConfidence: number): DataPoint[] {
  return points.filter(p => (p.confidence ?? 1) >= minConfidence);
}

export function addMetadata(points: DataPoint[], key: string, value: unknown): DataPoint[] {
  return points.map(p => ({
    ...p,
    metadata: { ...p.metadata, [key]: value },
  }));
}

export function renameLabel(points: DataPoint[], oldLabel: string, newLabel: string): DataPoint[] {
  return points.map(p => ({
    ...p,
    label: p.label === oldLabel ? newLabel : p.label,
  }));
}

export function computeCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const meanX = computeMean(x);
  const meanY = computeMean(y);
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// ========================================
// 数据清洗函数
// ========================================

export function removeNulls(points: DataPoint[]): DataPoint[] {
  return points.filter(p => p != null);
}

export function normalizeValues(points: DataPoint[]): DataPoint[] {
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return points.map(p => ({ ...p, value: 0 }));
  return points.map(p => ({ ...p, value: (p.value - min) / range }));
}

export function standardizeValues(points: DataPoint[]): DataPoint[] {
  const values = points.map(p => p.value);
  const mean = computeMean(values);
  const stddev = computeStdDev(values);
  if (stddev === 0) return points.map(p => ({ ...p, value: 0 }));
  return points.map(p => ({ ...p, value: (p.value - mean) / stddev }));
}

export function fillMissingValues(points: DataPoint[], strategy: 'zero' | 'mean' | 'median'): DataPoint[] {
  if (points.length === 0) return points;
  const values = points.map(p => p.value).filter(v => v != null && !isNaN(v));
  if (strategy === 'zero') return points.map(p => ({ ...p, value: p.value ?? 0 }));
  if (values.length === 0) return points;
  const fillValue = strategy === 'mean'
    ? computeMean(values)
    : computeMedian(values);
  return points.map(p => ({ ...p, value: p.value ?? fillValue }));
}

export function filterByLabel(points: DataPoint[], labels: string[]): DataPoint[] {
  const set = new Set(labels);
  return points.filter(p => set.has(p.label));
}

export function filterByDateRange(points: DataPoint[], start: number, end: number): DataPoint[] {
  return points.filter(p => p.timestamp >= start && p.timestamp <= end);
}

export function removeOutliers(points: DataPoint[], threshold: number = 3): DataPoint[] {
  const values = points.map(p => p.value);
  const mean = computeMean(values);
  const stddev = computeStdDev(values);
  if (stddev === 0) return points;
  return points.filter(p => Math.abs(p.value - mean) / stddev <= threshold);
}

// ========================================
// 数据加载器
// ========================================

export class DataLoader extends EventEmitter {
  private sources: Map<string, unknown> = new Map();
  private loaded: number = 0;
  private errors: number = 0;
  private startedAt: number = 0;

  constructor(private config: { timeout: number; retries: number; batchSize?: number }) {
    super();
  }

  registerSource(name: string, reader: unknown): void {
    this.sources.set(name, reader);
    this.emit('source-registered', { name, timestamp: Date.now() });
  }

  hasSource(name: string): boolean {
    return this.sources.has(name);
  }

  listSources(): string[] {
    return Array.from(this.sources.keys());
  }

  async loadFromSource(sourceName: string): Promise<DataBatch> {
    const reader = this.sources.get(sourceName);
    if (!reader) throw new Error('Unknown source: ' + sourceName);
    this.emit('loading-start', { source: sourceName, timestamp: Date.now() });

    const pointCount = Math.floor(Math.random() * 100) + 10;
    const points: DataPoint[] = [];
    for (let i = 0; i < pointCount; i++) {
      points.push({
        id: generateId(),
        timestamp: Date.now() - Math.floor(Math.random() * 86400000),
        value: Math.random() * 1000,
        label: ['sales', 'traffic', 'conversion', 'engagement'][Math.floor(Math.random() * 4)],
        tags: ['region:cn', 'platform:web', 'source:' + sourceName],
      });
    }

    const batch: DataBatch = {
      batchId: 'batch-' + Date.now() + '-' + sourceName,
      source: sourceName,
      points,
      collectedAt: Date.now(),
      errorCount: 0,
    };

    this.loaded += pointCount;
    this.emit('loading-complete', { batch, timestamp: Date.now() });
    return batch;
  }

  async loadAll(): Promise<DataBatch[]> {
    this.startedAt = Date.now();
    const results: DataBatch[] = [];
    const sources = Array.from(this.sources.entries());
    for (const [name] of sources) {
      try {
        results.push(await this.loadFromSource(name));
      } catch (err) {
        this.errors++;
        this.emit('loading-error', { source: name, error: err });
        if (this.config.retries > 0) {
          for (let i = 0; i < this.config.retries; i++) {
            try {
              results.push(await this.loadFromSource(name));
              break;
            } catch { this.errors++; }
          }
        }
      }
    }
    return results;
  }

  getLoadedCount(): number {
    return this.loaded;
  }

  getErrorCount(): number {
    return this.errors;
  }

  getElapsed(): number {
    return Date.now() - this.startedAt;
  }

  reset(): void {
    this.sources.clear();
    this.loaded = 0;
    this.errors = 0;
  }
}

// ========================================
// 聚合器
// ========================================

export class Aggregator {
  private results: Map<string, AggregationResult> = new Map();

  constructor(private config: { includePercentiles: boolean; precision: number }) {}

  aggregate(points: DataPoint[]): Map<string, AggregationResult> {
    const grouped = groupByLabel(points);
    const entries = Array.from(grouped.entries());

    for (const [label, group] of entries) {
      const values = group.map(p => p.value);
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      const avg = sum / count;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const median = computeMedian(values);
      const stddev = computeStdDev(values);

      const result: AggregationResult = {
        label,
        sum: parseFloat(sum.toFixed(this.config.precision)),
        avg: parseFloat(avg.toFixed(this.config.precision)),
        count,
        min,
        max,
        median,
        stddev: parseFloat(stddev.toFixed(this.config.precision)),
        p25: this.config.includePercentiles ? computePercentile(values, 25) : 0,
        p50: this.config.includePercentiles ? median : 0,
        p75: this.config.includePercentiles ? computePercentile(values, 75) : 0,
        p95: this.config.includePercentiles ? computePercentile(values, 95) : 0,
        p99: this.config.includePercentiles ? computePercentile(values, 99) : 0,
      };

      this.results.set(label, result);
    }

    return this.results;
  }

  getResult(label: string): AggregationResult | undefined {
    return this.results.get(label);
  }

  getAllResults(): AggregationResult[] {
    return Array.from(this.results.values());
  }

  clear(): void {
    this.results.clear();
  }
}

// ========================================
// 数据处理管道
// ========================================

export class DataPipeline {
  private steps: PipelineStep[] = [];
  private results: DataPoint[][] = [];

  constructor(private config: PipelineConfig) {
    this.steps = config.steps.filter(s => s.enabled);
  }

  async execute(input: DataPoint[]): Promise<DataPoint[]> {
    let data = [...input];
    this.results = [data];

    for (const step of this.steps) {
      try {
        data = await this.runStep(step, data);
        this.results.push([...data]);
      } catch (err) {
        if (this.config.onError === 'stop') throw err;
        if (this.config.onError === 'retry') {
          for (let i = 0; i < this.config.maxRetries; i++) {
            try {
              data = await this.runStep(step, data);
              break;
            } catch { continue; }
          }
        }
      }
    }

    return data;
  }

  private async runStep(step: PipelineStep, data: DataPoint[]): Promise<DataPoint[]> {
    switch (step.name) {
      case 'removeNulls': return removeNulls(data);
      case 'removeDuplicates': return deduplicateById(data);
      case 'normalize': return normalizeValues(data);
      case 'standardize': return standardizeValues(data);
      case 'removeOutliers': return removeOutliers(data, (step.config?.threshold as number) ?? 3);
      case 'fillMissing': return fillMissingValues(data, (step.config?.strategy as 'zero' | 'mean' | 'median') ?? 'zero');
      case 'filterByLabel': return filterByLabel(data, step.config?.labels as string[] ?? []);
      case 'filterByDateRange': return filterByDateRange(data, step.config?.start as number ?? 0, step.config?.end as number ?? Infinity);
      case 'sortByValue': return sortByValue(data, (step.config?.order as 'asc' | 'desc') ?? 'desc');
      default: return data;
    }
  }

  getIntermediateResults(): DataPoint[][] {
    return this.results;
  }

  getStepCount(): number {
    return this.steps.length;
  }
}

// ========================================
// 数据写入器
// ========================================

export class DataWriter {
  private written: number = 0;

  constructor(private outputDir: string) {}

  async writeJSON(data: unknown, filename: string): Promise<string> {
    const filePath = path.join(this.outputDir, filename);
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
    this.written++;
    return filePath;
  }

  async writeCSV(points: DataPoint[], filename: string): Promise<string> {
    const filePath = path.join(this.outputDir, filename);
    const header = 'id,timestamp,value,label,tags';
    const rows = points.map(p =>
      `${p.id},${p.timestamp},${p.value},${p.label},${p.tags.join(';')}`
    );
    fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf-8');
    this.written++;
    return filePath;
  }

  async writeReport(results: AggregationResult[], options: ReportOptions): Promise<string> {
    if (options.format === 'json') {
      return this.writeJSON(results, 'report.json');
    }
    if (options.format === 'csv') {
      const filePath = path.join(this.outputDir, 'report.csv');
      const header = Object.keys(results[0] ?? {}).join(',');
      const rows = results.map(r => Object.values(r).join(','));
      fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf-8');
      return filePath;
    }
    if (options.format === 'markdown') {
      const filePath = path.join(this.outputDir, 'report.md');
      let md = '# ' + (options.title ?? 'Data Report') + '\n\n';
      md += '| Label | Sum | Avg | Count | Min | Max |\n';
      md += '|-------|-----|-----|-------|-----|-----|\n';
      for (const r of results) {
        md += `| ${r.label} | ${r.sum} | ${r.avg} | ${r.count} | ${r.min} | ${r.max} |\n`;
      }
      fs.writeFileSync(filePath, md, 'utf-8');
      return filePath;
    }
    throw new Error('Unsupported format: ' + options.format);
  }

  getWrittenCount(): number {
    return this.written;
  }
}

// ========================================
// 报告生成器
// ========================================

export class ReportGenerator {
  private metadata: Record<string, unknown> = {};

  constructor(private options: ReportOptions) {}

  generate(results: AggregationResult[]): string {
    const sorted = this.sortResults(results);
    const limited = sorted.slice(0, this.options.limit);

    switch (this.options.format) {
      case 'json': return this.generateJSON(limited);
      case 'csv': return this.generateCSV(limited);
      case 'html': return this.generateHTML(limited);
      case 'markdown': return this.generateMarkdown(limited);
      default: throw new Error('Unsupported format');
    }
  }

  private sortResults(results: AggregationResult[]): AggregationResult[] {
    const key = this.options.sortBy as keyof AggregationResult;
    const order = this.options.sortOrder === 'asc' ? 1 : -1;
    return [...results].sort((a, b) => {
      const av = a[key] as number;
      const bv = b[key] as number;
      return (av - bv) * order;
    });
  }

  private generateJSON(results: AggregationResult[]): string {
    return JSON.stringify({ metadata: this.metadata, results }, null, 2);
  }

  private generateCSV(results: AggregationResult[]): string {
    const keys = Object.keys(results[0] ?? {}) as (keyof AggregationResult)[];
    const header = keys.join(',');
    const rows = results.map(r => keys.map(k => r[k]).join(','));
    return [header, ...rows].join('\n');
  }

  private generateHTML(results: AggregationResult[]): string {
    const keys = Object.keys(results[0] ?? {}) as (keyof AggregationResult)[];
    let html = '<table><thead><tr>';
    for (const k of keys) html += '<th>' + k + '</th>';
    html += '</tr></thead><tbody>';
    for (const r of results) {
      html += '<tr>';
      for (const k of keys) html += '<td>' + r[k] + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  private generateMarkdown(results: AggregationResult[]): string {
    const keys = Object.keys(results[0] ?? {}) as (keyof AggregationResult)[];
    let md = '| ' + keys.join(' | ') + ' |\n';
    md += '| ' + keys.map(() => '---').join(' | ') + ' |\n';
    for (const r of results) {
      md += '| ' + keys.map(k => r[k]).join(' | ') + ' |\n';
    }
    return md;
  }

  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }
}

// ========================================
// 缓存管理器
// ========================================

export class CacheManager<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private totalHits: number = 0;
  private totalMisses: number = 0;

  constructor(private ttl: number, private maxSize: number = 1000) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.totalMisses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.totalMisses++;
      return undefined;
    }
    entry.hits++;
    this.totalHits++;
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.entries().next().value;
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, {
      key,
      value,
      expiresAt: Date.now() + this.ttl,
      hits: 0,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.totalHits + this.totalMisses;
    return {
      size: this.cache.size,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: total === 0 ? 0 : this.totalHits / total,
    };
  }
}

// ========================================
// 时间序列分析器
// ========================================

export interface TrendPoint {
  timestamp: number;
  value: number;
  label: string;
}

export interface SeasonalDecomposition {
  trend: TrendPoint[];
  seasonal: TrendPoint[];
  residual: TrendPoint[];
}

export class TimeSeriesAnalyzer {
  constructor(private windowSize: number = 7) {}

  movingAverage(points: DataPoint[]): TrendPoint[] {
    const sorted = sortByTimestamp(points);
    const result: TrendPoint[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const start = Math.max(0, i - this.windowSize + 1);
      const window = sorted.slice(start, i + 1);
      const avg = computeMean(window.map(p => p.value));
      result.push({
        timestamp: sorted[i].timestamp,
        value: avg,
        label: sorted[i].label,
      });
    }

    return result;
  }

  detectAnomalies(points: DataPoint[], threshold: number = 2): DataPoint[] {
    const values = points.map(p => p.value);
    const mean = computeMean(values);
    const stddev = computeStdDev(values);

    return points.filter(p => Math.abs(p.value - mean) > threshold * stddev);
  }

  forecast(points: DataPoint[], steps: number): TrendPoint[] {
    const sorted = sortByTimestamp(points);
    if (sorted.length < 2) return [];

    const values = sorted.map(p => p.value);
    const indices = values.map((_, i) => i);
    const n = values.length;

    // Simple linear regression
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((a, i) => a + i * values[i], 0);
    const sumXX = indices.reduce((a, i) => a + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const lastTs = sorted[n - 1].timestamp;
    const interval = n > 1 ? (lastTs - sorted[0].timestamp) / (n - 1) : 3600000;

    const result: TrendPoint[] = [];
    for (let i = 1; i <= steps; i++) {
      const idx = n + i - 1;
      result.push({
        timestamp: lastTs + interval * i,
        value: Math.max(0, slope * idx + intercept),
        label: 'forecast',
      });
    }

    return result;
  }
}

// ========================================
// 高级聚合函数
// ========================================

export function aggregateByTimeWindow(
  points: DataPoint[],
  windowMs: number
): Map<number, { sum: number; count: number; avg: number }> {
  const windows = new Map<number, { sum: number; count: number; avg: number }>();

  for (const p of points) {
    const windowKey = Math.floor(p.timestamp / windowMs) * windowMs;
    const existing = windows.get(windowKey) ?? { sum: 0, count: 0, avg: 0 };
    existing.sum += p.value;
    existing.count++;
    existing.avg = existing.sum / existing.count;
    windows.set(windowKey, existing);
  }

  return windows;
}

export function computeGrowthRate(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0);
  const rates: number[] = [0];
  for (let i = 1; i < values.length; i++) {
    rates.push(values[i - 1] === 0 ? 0 : (values[i] - values[i - 1]) / values[i - 1]);
  }
  return rates;
}

export function computeCumulativeSum(values: number[]): number[] {
  const cumulative: number[] = [];
  let sum = 0;
  for (const v of values) {
    sum += v;
    cumulative.push(sum);
  }
  return cumulative;
}

export function computeRollingMax(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    result.push(Math.max(...values.slice(start, i + 1)));
  }
  return result;
}

export function computeRollingMin(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    result.push(Math.min(...values.slice(start, i + 1)));
  }
  return result;
}

export function weightedAverage(values: number[], weights: number[]): number {
  if (values.length === 0 || values.length !== weights.length) return 0;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;
}

export function exponentialSmoothing(values: number[], alpha: number): number[] {
  if (values.length === 0) return [];
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

export function detectSeasonality(values: number[], period: number): number {
  if (values.length < period * 2) return 0;
  let correlation = 0;
  for (let i = 0; i < values.length - period; i++) {
    correlation += (values[i] - computeMean(values)) * (values[i + period] - computeMean(values));
  }
  const var1 = computeStdDev(values.slice(0, values.length - period));
  const var2 = computeStdDev(values.slice(period));
  if (var1 === 0 || var2 === 0) return 0;
  return correlation / (var1 * var2 * (values.length - period));
}

export function findPeaks(points: DataPoint[]): DataPoint[] {
  const sorted = sortByTimestamp(points);
  const peaks: DataPoint[] = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    if (sorted[i].value > sorted[i - 1].value && sorted[i].value > sorted[i + 1].value) {
      peaks.push(sorted[i]);
    }
  }
  return peaks;
}

export function findValleys(points: DataPoint[]): DataPoint[] {
  const sorted = sortByTimestamp(points);
  const valleys: DataPoint[] = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    if (sorted[i].value < sorted[i - 1].value && sorted[i].value < sorted[i + 1].value) {
      valleys.push(sorted[i]);
    }
  }
  return valleys;
}

// ========================================
// 数据验证
// ========================================

export function validateDataPoint(p: DataPoint): string[] {
  const errors: string[] = [];
  if (!p.id) errors.push('Missing id');
  if (p.value == null || isNaN(p.value)) errors.push('Invalid value');
  if (!p.label) errors.push('Missing label');
  if (!p.tags || !Array.isArray(p.tags)) errors.push('Tags must be an array');
  return errors;
}

export function validateBatch(batch: DataBatch): string[] {
  const errors: string[] = [];
  if (!batch.batchId) errors.push('Missing batchId');
  if (!batch.source) errors.push('Missing source');
  if (!Array.isArray(batch.points)) errors.push('Points must be an array');
  for (const p of batch.points) {
    errors.push(...validateDataPoint(p));
  }
  return errors;
}

export function checkDataQuality(points: DataPoint[]): {
  totalPoints: number;
  nullCount: number;
  zeroCount: number;
  negativeCount: number;
  uniqueLabels: number;
  dateRange: [number, number] | null;
} {
  let nullCount = 0, zeroCount = 0, negativeCount = 0;
  const labels = new Set<string>();
  let minTs = Infinity, maxTs = -Infinity;

  for (const p of points) {
    if (!p) nullCount++;
    else {
      if (labels) { /* always count labels */ }
      labels.add(p.label);
      if (p.value === 0) zeroCount++;
      if (p.value < 0) negativeCount++;
      minTs = Math.min(minTs, p.timestamp);
      maxTs = Math.max(maxTs, p.timestamp);
    }
  }

  return {
    totalPoints: points.length,
    nullCount,
    zeroCount,
    negativeCount,
    uniqueLabels: labels.size,
    dateRange: points.length > 0 ? [minTs, maxTs] : null,
  };
}

// ========================================
// 指标收集器
// ========================================

export class MetricsCollector {
  private metrics: MetricEntry[] = [];
  private startTime: number = Date.now();

  record(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      unit,
      value,
      timestamp: Date.now(),
      tags: tags ?? {},
    });
  }

  query(name: string, since?: number): MetricEntry[] {
    return this.metrics.filter(m =>
      m.name === name &&
      (since === undefined || m.timestamp >= since)
    );
  }

  getSummary(name: string): { min: number; max: number; avg: number; count: number } | null {
    const filtered = this.metrics.filter(m => m.name === name);
    if (filtered.length === 0) return null;
    const values = filtered.map(m => m.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: computeMean(values),
      count: values.length,
    };
  }

  getAllMetrics(): MetricEntry[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
    this.startTime = Date.now();
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }
}

// ========================================
// 主入口
// ========================================

export async function processPipeline(
  sources: string[],
  pipelineConfig: PipelineConfig,
  reportOptions: ReportOptions
): Promise<{
  results: AggregationResult[];
  report: string;
  stats: { totalPoints: number; duration: number; steps: number; errors: number };
}> {
  const loader = new DataLoader({ timeout: 5000, retries: 2, batchSize: 100 });
  for (const src of sources) {
    loader.registerSource(src, {});
  }

  const batches = await loader.loadAll();
  const allPoints = mergeBatches(batches);

  const pipeline = new DataPipeline(pipelineConfig);
  const cleaned = await pipeline.execute(allPoints.points);

  const aggregator = new Aggregator({ includePercentiles: true, precision: 2 });
  const results = aggregator.aggregate(cleaned);

  const reporter = new ReportGenerator(reportOptions);
  const report = reporter.generate(aggregator.getAllResults());

  return {
    results: aggregator.getAllResults(),
    report,
    stats: {
      totalPoints: allPoints.points.length,
      duration: loader.getElapsed(),
      steps: pipeline.getStepCount(),
      errors: loader.getErrorCount(),
    },
  };
}


// padding line 761

// padding line 763

// padding line 765

// padding line 767

// padding line 769

// padding line 771

// padding line 773

// padding line 775

// padding line 777

// padding line 779

// padding line 781

// padding line 783

// padding line 785

// padding line 787

// padding line 789

// padding line 791

// padding line 793

// padding line 795

// padding line 797

// padding line 799

// padding line 801

// padding line 803

// padding line 805

// padding line 807

// padding line 809

// padding line 811

// padding line 813

// padding line 815

// padding line 817

// padding line 819

// padding line 821

// padding line 823

// padding line 825

// padding line 827

// padding line 829

// padding line 831

// padding line 833

// padding line 835

// padding line 837

// padding line 839

// padding line 841

// padding line 843

// padding line 845

// padding line 847

// padding line 849

// padding line 851

// padding line 853

// padding line 855

// padding line 857

// padding line 859

// padding line 861

// padding line 863

// padding line 865

// padding line 867

// padding line 869

// padding line 871

// padding line 873

// padding line 875

// padding line 877

// padding line 879

// padding line 881

// padding line 883

// padding line 885

// padding line 887

// padding line 889

// padding line 891

// padding line 893

// padding line 895

// padding line 897

// padding line 899

// padding line 901

// padding line 903

// padding line 905

// padding line 907

// padding line 909

// padding line 911

// padding line 913

// padding line 915

// padding line 917

// padding line 919

// padding line 921

// padding line 923

// padding line 925

// padding line 927

// padding line 929

// padding line 931

// padding line 933

// padding line 935

// padding line 937

// padding line 939

// padding line 941

// padding line 943

// padding line 945

// padding line 947

// padding line 949

// padding line 951

// padding line 953

// padding line 955

// padding line 957

// padding line 959

// padding line 961

// padding line 963

// padding line 965

// padding line 967

// padding line 969

// padding line 971

// padding line 973

// padding line 975

// padding line 977

// padding line 979

// padding line 981

// padding line 983

// padding line 985

// padding line 987

// padding line 989

// padding line 991

// padding line 993

// padding line 995

// padding line 997

// padding line 999

// padding line 1001

// padding line 1003

// padding line 1005

// padding line 1007

// padding line 1009

// padding line 1011

// padding line 1013

// padding line 1015

// padding line 1017

// padding line 1019

// padding line 1021

// padding line 1023

// padding line 1025

// padding line 1027

// padding line 1029

// padding line 1031

// padding line 1033

// padding line 1035

// padding line 1037

// padding line 1039

// padding line 1041

// padding line 1043

// padding line 1045

// padding line 1047

// padding line 1049

// padding line 1051

// padding line 1053

// padding line 1055

// padding line 1057

// padding line 1059

// padding line 1061

// padding line 1063

// padding line 1065

// padding line 1067

// padding line 1069

// padding line 1071

// padding line 1073

// padding line 1075

// padding line 1077

// padding line 1079

// padding line 1081

// padding line 1083

// padding line 1085

// padding line 1087

// padding line 1089

// padding line 1091

// padding line 1093

// padding line 1095

// padding line 1097

// padding line 1099

// padding line 1101

// padding line 1103

// padding line 1105

// padding line 1107

// padding line 1109

// padding line 1111

// padding line 1113

// padding line 1115

// padding line 1117

// padding line 1119

// padding line 1121

// padding line 1123

// padding line 1125

// padding line 1127

// padding line 1129

// padding line 1131

// padding line 1133

// padding line 1135

// padding line 1137

// padding line 1139

// padding line 1141

// padding line 1143

// padding line 1145

// padding line 1147

// padding line 1149

// padding line 1151

// padding line 1153

// padding line 1155

// padding line 1157

// padding line 1159

// padding line 1161

// padding line 1163

// padding line 1165

// padding line 1167

// padding line 1169

// padding line 1171

// padding line 1173

// padding line 1175

// padding line 1177

// padding line 1179

// padding line 1181

// padding line 1183

// padding line 1185

// padding line 1187

// padding line 1189

// padding line 1191

// padding line 1193

// padding line 1195

// padding line 1197

// padding line 1199

// padding line 1201

// padding line 1203

// padding line 1205

// padding line 1207

// padding line 1209

// padding line 1211

// padding line 1213

// padding line 1215

// padding line 1217

// padding line 1219

// padding line 1221

// padding line 1223

// padding line 1225

// padding line 1227

// padding line 1229

// padding line 1231

// padding line 1233

// padding line 1235

// padding line 1237

// padding line 1239

// padding line 1241

// padding line 1243

// padding line 1245

// padding line 1247

// padding line 1249

// padding line 1251

// padding line 1253

// padding line 1255

// padding line 1257

// padding line 1259

// padding line 1261

// padding line 1263

// padding line 1265

// padding line 1267

// padding line 1269

// padding line 1271

// padding line 1273

// padding line 1275

// padding line 1277

// padding line 1279

// padding line 1281

// padding line 1283

// padding line 1285

// padding line 1287

// padding line 1289

// padding line 1291

// padding line 1293

// padding line 1295

// padding line 1297

// padding line 1299

// padding line 1301

// padding line 1303

// padding line 1305

// padding line 1307

// padding line 1309

// padding line 1311

// padding line 1313

// padding line 1315

// padding line 1317

// padding line 1319

// padding line 1321

// padding line 1323

// padding line 1325

// padding line 1327

// padding line 1329

// padding line 1331

// padding line 1333

// padding line 1335

// padding line 1337

// padding line 1339

// padding line 1341

// padding line 1343

// padding line 1345

// padding line 1347

// padding line 1349

// padding line 1351

// padding line 1353

// padding line 1355

// padding line 1357

// padding line 1359

// padding line 1361

// padding line 1363

// padding line 1365

// padding line 1367

// padding line 1369

// padding line 1371

// padding line 1373

// padding line 1375

// padding line 1377

// padding line 1379

// padding line 1381

// padding line 1383

// padding line 1385

// padding line 1387

// padding line 1389

// padding line 1391

// padding line 1393

// padding line 1395

// padding line 1397

// padding line 1399

// padding line 1401

// padding line 1403

// padding line 1405

// padding line 1407

// padding line 1409

// padding line 1411

// padding line 1413

// padding line 1415

// padding line 1417

// padding line 1419

// padding line 1421

// padding line 1423

// padding line 1425

// padding line 1427

// padding line 1429

// padding line 1431

// padding line 1433

// padding line 1435

// padding line 1437

// padding line 1439

// padding line 1441

// padding line 1443

// padding line 1445

// padding line 1447

// padding line 1449

// padding line 1451

// padding line 1453

// padding line 1455

// padding line 1457

// padding line 1459

// padding line 1461

// padding line 1463

// padding line 1465

// padding line 1467

// padding line 1469

// padding line 1471

// padding line 1473

// padding line 1475

// padding line 1477

// padding line 1479

// padding line 1481

// padding line 1483

// padding line 1485

// padding line 1487

// padding line 1489

// padding line 1491

// padding line 1493

// padding line 1495

// padding line 1497

// padding line 1499

// padding line 1501

// padding line 1503

// padding line 1505

// padding line 1507

// padding line 1509

// padding line 1511

// padding line 1513

// padding line 1515

// padding line 1517

// padding line 1519

// padding line 1521

// padding line 1523

// padding line 1525

// padding line 1527

// padding line 1529

// padding line 1531

// padding line 1533

// padding line 1535

// padding line 1537

// padding line 1539

// padding line 1541

// padding line 1543

// padding line 1545

// padding line 1547

// padding line 1549

// padding line 1551

// padding line 1553

// padding line 1555

// padding line 1557

// padding line 1559

// padding line 1561

// padding line 1563

// padding line 1565

// padding line 1567

// padding line 1569

// padding line 1571

// padding line 1573

// padding line 1575

// padding line 1577

// padding line 1579

// padding line 1581

// padding line 1583

// padding line 1585

// padding line 1587

// padding line 1589

// padding line 1591

// padding line 1593

// padding line 1595

// padding line 1597

// padding line 1599

// padding line 1601

// padding line 1603

// padding line 1605

// padding line 1607

// padding line 1609

// padding line 1611

// padding line 1613

// padding line 1615

// padding line 1617

// padding line 1619

// padding line 1621

// padding line 1623

// padding line 1625

// padding line 1627

// padding line 1629

// padding line 1631

// padding line 1633

// padding line 1635

// padding line 1637

// padding line 1639

// padding line 1641

// padding line 1643

// padding line 1645

// padding line 1647

// padding line 1649

// padding line 1651

// padding line 1653

// padding line 1655

// padding line 1657

// padding line 1659

// padding line 1661

// padding line 1663

// padding line 1665

// padding line 1667

// padding line 1669

// padding line 1671

// padding line 1673

// padding line 1675

// padding line 1677

// padding line 1679

// padding line 1681

// padding line 1683

// padding line 1685

// padding line 1687

// padding line 1689

// padding line 1691

// padding line 1693

// padding line 1695

// padding line 1697

// padding line 1699

// padding line 1701

// padding line 1703

// padding line 1705

// padding line 1707

// padding line 1709

// padding line 1711

// padding line 1713

// padding line 1715

// padding line 1717

// padding line 1719

// padding line 1721

// padding line 1723

// padding line 1725

// padding line 1727

// padding line 1729

// padding line 1731

// padding line 1733

// padding line 1735

// padding line 1737

// padding line 1739

// padding line 1741

// padding line 1743

// padding line 1745

// padding line 1747

// padding line 1749

// padding line 1751

// padding line 1753

// padding line 1755

// padding line 1757

// padding line 1759

// padding line 1761

// padding line 1763

// padding line 1765

// padding line 1767

// padding line 1769

// padding line 1771

// padding line 1773

// padding line 1775

// padding line 1777

// padding line 1779

// padding line 1781

// padding line 1783

// padding line 1785

// padding line 1787

// padding line 1789

// padding line 1791

// padding line 1793

// padding line 1795

// padding line 1797

// padding line 1799

// padding line 1801

// padding line 1803

// padding line 1805

// padding line 1807

// padding line 1809

// padding line 1811

// padding line 1813

// padding line 1815

// padding line 1817

// padding line 1819

// padding line 1821

// padding line 1823

// padding line 1825

// padding line 1827

// padding line 1829

// padding line 1831

// padding line 1833

// padding line 1835

// padding line 1837

// padding line 1839

// padding line 1841

// padding line 1843

// padding line 1845

// padding line 1847

// padding line 1849

// padding line 1851

// padding line 1853

// padding line 1855

// padding line 1857

// padding line 1859

// padding line 1861

// padding line 1863

// padding line 1865

// padding line 1867

// padding line 1869

// padding line 1871

// padding line 1873

// padding line 1875

// padding line 1877

// padding line 1879

// padding line 1881

// padding line 1883

// padding line 1885

// padding line 1887

// padding line 1889

// padding line 1891

// padding line 1893

// padding line 1895

// padding line 1897

// padding line 1899

// padding line 1901

// padding line 1903

// padding line 1905

// padding line 1907

// padding line 1909

// padding line 1911

// padding line 1913

// padding line 1915

// padding line 1917

// padding line 1919

// padding line 1921

// padding line 1923

// padding line 1925

// padding line 1927

// padding line 1929

// padding line 1931

// padding line 1933

// padding line 1935

// padding line 1937

// padding line 1939

// padding line 1941

// padding line 1943

// padding line 1945

// padding line 1947

// padding line 1949

// padding line 1951

// padding line 1953

// padding line 1955

// padding line 1957

// padding line 1959

// padding line 1961

// padding line 1963

// padding line 1965

// padding line 1967

// padding line 1969

// padding line 1971

// padding line 1973

// padding line 1975

// padding line 1977

// padding line 1979

// padding line 1981

// padding line 1983

// padding line 1985

// padding line 1987

// padding line 1989

// padding line 1991

// padding line 1993

// padding line 1995

// padding line 1997

// padding line 1999

// padding line 2001

// padding line 2003

// padding line 2005

// padding line 2007

// padding line 2009

// padding line 2011

// padding line 2013

// padding line 2015

// padding line 2017

// padding line 2019

// padding line 2021

// padding line 2023

// padding line 2025

// padding line 2027

// padding line 2029

// padding line 2031

// padding line 2033

// padding line 2035

// padding line 2037

// padding line 2039

// padding line 2041

// padding line 2043

// padding line 2045

// padding line 2047

// padding line 2049

// padding line 2051