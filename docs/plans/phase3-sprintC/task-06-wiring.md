# Task 06: Sprint C Wiring

**Files:**
- Modify: `src/memory/manager.ts`
- Modify: `src/core/agent.ts`
- Modify: `src/core/prompt/assembler.ts`
- Modify: `src/cli/repl.ts`
- Create: `tests/integration/memory-intelligence.test.ts`

## Goal

Wire all Sprint C features into the existing agent loop, memory manager, prompt assembler, and REPL.

## Changes

### agent.ts — Post-turn auto-extraction hook

```typescript
// After assistant response is finalized:
if (this.autoExtractor) {
  this.autoExtractor.extract(messages).then(facts => {
    if (facts.length > 0) this.autoExtractor.storeFacts(facts);
  }).catch(() => {}); // Silent failure, never break agent loop
}
```

### manager.ts — Entity linking on remember/forget

```typescript
// In remember():
await this.entityLinker.extractEntities(content);

// In forget():
await this.entityLinker.removeFromIndex(name);

// In recall():
const linked = await this.entityLinker.link(primaryResults);
// Return LinkedMemories with related context
```

### assembler.ts — Knowledge + profile injection

```typescript
// After MEMORY.md injection:
const profile = await userProfile.toMarkdown();
if (profile) systemPrompt += `\n\n${profile}`;

const knowledge = await knowledgeBase.injectContext(userQuery);
if (knowledge) systemPrompt += `\n\n${knowledge}`;
```

### repl.ts — Session summarization on exit

```typescript
// On SIGINT or /exit:
const session = this.sessionStore.getCurrent();
await this.summarizer.summarize(session);
```

## Integration Test

Full end-to-end test:
1. Start agent loop with mock LLM
2. Send a multi-turn conversation
3. Verify auto-extraction fires after assistant turns
4. Verify entity index updates
5. Verify knowledge injection in system prompt
6. Verify user profile injection
7. Verify session summary on exit
