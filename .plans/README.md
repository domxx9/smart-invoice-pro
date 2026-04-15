# Smart Invoice Pro — Implementation Plan (Index)

| Phase | File | Effort | Priority |
|-------|------|--------|----------|
| 0 | [00-stabilisation.md](./00-stabilisation.md) | ~4 hrs | Critical |
| 1 | [01-onnx-switch.md](./01-onnx-switch.md) — AI Runtime Decision | ~4 hrs | Critical |
| 2 | [02-testing.md](./02-testing.md) | ~3-5 days | Critical |
| 3 | [03-ai-pipeline-regex.md](./03-ai-pipeline-regex.md) | ~2-3 days | High |
| 4 | [04-burger-menu.md](./04-burger-menu.md) | ~1 day | High |
| 5 | [05-contacts.md](./05-contacts.md) | ~2 days | High |
| 6 | [06-invoice-lifecycle.md](./06-invoice-lifecycle.md) | ~2-3 days | High |
| 7 | [07-background-sync.md](./07-background-sync.md) | ~2-3 days | Medium |
| 8 | [08-picker.md](./08-picker.md) | ~2-3 days | Medium |
| - | [09-code-review.md](./09-code-review.md) | Reference | - |

## Dependency Map

```
Phase 0 (stabilise)
  ├── Phase 1 (AI runtime cleanup — remove ONNX dead code, keep gemma.js)
  │     └── Phase 3 (AI pipeline + regex)
  ├── Phase 2 (testing — runs alongside all phases)
  ├── Phase 4 (burger menu)
  │     └── Phase 5 (contacts)
  ├── Phase 6 (invoice lifecycle)
  │     └── Phase 8 (picker)
  └── Phase 7 (background sync)
```

## Recommended Weekly Sequence

- **Week 1:** Phase 0 + Phase 1 + begin Phase 2 (test setup + helpers unit tests)
- **Week 2:** Complete Phase 2 + Phase 3
- **Week 3:** Phase 4 + Phase 5 + Phase 6
- **Week 4:** Phase 7 + Phase 8
