/// <reference types="vite/client" />
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const engine = '../src/engine/';
const facades = ['llmBrain.ts', 'storageEngine.ts'];
const moduleDirs = ['cognition/', 'storage/'];
const sources = new Map(Object.entries(import.meta.glob<string>([
  '../src/engine/llmBrain.ts',
  '../src/engine/storageEngine.ts',
  '../src/engine/{cognition,cognitive,storage}/**/*.ts',
  '!../src/engine/**/*.d.ts',
], { eager: true, query: '?raw', import: 'default' })).map(([file, source]) => [file.slice(engine.length), source]));
const modules = [...sources.keys()].filter(file => !facades.includes(file));

function resolveRelative(importer: string, specifier: string) {
  const segments = importer.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '..') {
      if (!segments.length) return undefined;
      segments.pop();
    } else if (part && part !== '.') segments.push(part);
  }
  const base = segments.join('/');
  return [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}/index.ts`].find(candidate => sources.has(candidate));
}

function hasRuntimeImport(node: ts.ImportDeclaration) {
  const clause = node.importClause;
  if (!clause) return true; // Bare side-effect import.
  if (clause.isTypeOnly) return false;
  if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return true;
  // import {} remains a side-effect edge; explicit type-only specifiers do not.
  return !clause.namedBindings.elements.length || clause.namedBindings.elements.some(member => !member.isTypeOnly);
}
function hasRuntimeExport(node: ts.ExportDeclaration) {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return true;
  return !node.exportClause.elements.length || node.exportClause.elements.some(member => !member.isTypeOnly);
}
function runtimeDependencies(path: string) {
  const dependencies = new Set<string>();
  const source = sources.get(path);
  if (source === undefined) throw Error(`No source captured for ${path}`);
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true);
  const add = (specifier?: ts.Node) => {
    if (!specifier || !ts.isStringLiteralLike(specifier) || !specifier.text.startsWith('.')) return;
    const target = resolveRelative(path, specifier.text);
    if (target) dependencies.add(target);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && hasRuntimeImport(node)) add(node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && hasRuntimeExport(node)) add(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return dependencies;
}

describe('storage and cognition runtime module boundaries', () => {
  it('keeps both facades and extracted implementation modules under 1000 physical lines', () => {
    for (const facade of facades) expect(sources.has(facade)).toBe(true);
    for (const directory of moduleDirs) expect(modules.filter(file => file.startsWith(directory)).length).toBeGreaterThan(1);
    expect([...sources].filter(([, source]) => source.replace(/\r?\n$/, '').split(/\r?\n/).length >= 1000).map(([file]) => file)).toEqual([]);
  });

  it('does not create a value cycle or import back into either public facade', () => {
    const graph = new Map([...facades, ...modules].map(path => [path, runtimeDependencies(path)]));
    const backrefs = modules.flatMap(path => [...(graph.get(path) ?? [])].filter(edge => facades.includes(edge))
      .map(edge => [path, edge]));
    expect(backrefs).toEqual([]);
    const visited = new Set<string>();
    const active = new Set<string>();
    const cycles: string[][] = [];
    const walk = (node: string, trail: readonly string[] = []) => {
      if (active.has(node)) { cycles.push([...trail.slice(trail.indexOf(node)), node]); return; }
      if (visited.has(node)) return;
      visited.add(node);
      active.add(node);
      for (const next of graph.get(node) ?? []) if (graph.has(next)) walk(next, [...trail, node]);
      active.delete(node);
    };
    for (const root of graph.keys()) walk(root);
    expect(cycles).toEqual([]);
  });
});
