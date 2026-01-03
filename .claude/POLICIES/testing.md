# Testing Policy

Standards for test coverage, TDD workflow, and quality gates.

---

## Test-Driven Development (TDD)

### Mandatory Sequence

```
1. Write test → 2. See it fail → 3. Implement → 4. See it pass → 5. Refactor
```

**Never skip steps 1-2.** Writing tests after implementation misses design benefits.

### TDD Workflow

```javascript
// Step 1: Write test first
describe('filterMediaByType', () => {
    test('returns only matching media types', () => {
        const media = [
            { name: 'photo.jpg', type: 'image' },
            { name: 'video.mp4', type: 'video' }
        ];
        const result = filterMediaByType(media, 'image');
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('image');
    });
});

// Step 2: Run test — should FAIL (function doesn't exist)
// Step 3: Implement minimal code to pass
function filterMediaByType(media, type) {
    return media.filter(m => m.type === type);
}

// Step 4: Run test — should PASS
// Step 5: Refactor if needed (add JSDoc, optimize, etc.)
```

---

## Coverage Requirements

| Code Type | Minimum Coverage |
|-----------|------------------|
| New features | 80% |
| Bug fixes | 100% of fix path |
| Critical paths | 90% |
| Utility functions | 70% |

### What Must Be Tested

- [ ] All public methods
- [ ] All critical code paths
- [ ] Error handling (exceptions, edge cases)
- [ ] Boundary conditions
- [ ] Integration points

### What May Be Skipped

- Trivial getters/setters
- Generated code
- Third-party library wrappers (test integration instead)

---

## Test Types

### Unit Tests

Test individual functions/methods in isolation.

```javascript
describe('calculateSimilarity', () => {
    test('returns 0 for completely different hashes', () => {
        // Unit test: isolated function behavior
        const result = calculateSimilarity('0000', 'ffff');
        expect(result).toBe(0);
    });
});
```

### Integration Tests

Test component interactions.

```javascript
describe('MediaViewer integration', () => {
    test('navigation updates current index correctly', () => {
        // Integration: viewer + state interaction
        const viewer = new MediaViewer();
        viewer.loadFiles([file1, file2, file3]);
        viewer.navigateNext();

        // Verify state updated
        expect(viewer.currentIndex).toBe(1);
    });
});
```

### Regression Tests

Prevent fixed bugs from recurring.

```javascript
describe('Regression tests', () => {
    test('files with spaces in name load correctly', () => {
        // Regression: Issue #42 - spaces in filename caused crash
        const files = [
            { name: 'file with spaces.jpg', path: '/path/file with spaces.jpg' }
        ];
        const result = processFiles(files); // Should not throw
        expect(result).toHaveLength(1);
    });
});
```

---

## Test Structure

### File Organization

```
tests/
├── unit/
│   ├── media-viewer.test.js
│   ├── vp-tree.test.js
│   └── similarity.test.js
├── integration/
│   ├── file-operations.test.js
│   └── ipc-handlers.test.js
└── regression/
    └── known-bugs.test.js
```

### Test Naming

```javascript
describe('[unit]', () => {
    test('[scenario] [expected_outcome]', () => {
        // Test explaining:
        // - What is being tested
        // - Why this case matters
        // - Reference to related issue/requirement
    });
});
```

Examples:
- `filterMedia empty_list returns_empty`
- `calculateSimilarity identical_hashes returns_1`
- `navigateNext at_last_index wraps_to_first`

### Test Body: AAA Pattern

```javascript
describe('recommendSimilar', () => {
    test('returns files sorted by similarity', () => {
        // Arrange: Set up test data and conditions
        const currentFile = { hash: 'abc123' };
        const files = [
            { name: 'similar.jpg', hash: 'abc124' },
            { name: 'different.jpg', hash: 'xyz789' }
        ];

        // Act: Execute the code under test
        const result = recommendSimilar(currentFile, files);

        // Assert: Verify expected outcome
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('similar.jpg');
    });
});
```

---

## Edge Cases Checklist

For every function, consider:

| Category | Examples |
|----------|----------|
| Empty input | `[]`, `""`, `None`, `{}` |
| Single element | List with 1 item |
| Boundary values | 0, -1, MAX_INT, MIN_INT |
| Invalid types | String where int expected |
| Unicode | Emojis, RTL text, special chars |
| Concurrent access | Race conditions |
| Resource limits | Very large inputs |

---

## Running Tests

### Commands

```bash
# All tests (when Jest is configured)
npm test

# Specific file
npm test -- media-viewer.test.js

# Specific test pattern
npm test -- --testNamePattern="filterMedia"

# With coverage
npm test -- --coverage

# Watch mode (re-run on changes)
npm test -- --watch

# Stop on first failure
npm test -- --bail
```

### Pre-commit Integration

Tests run automatically via pre-commit hooks. If tests fail, commit is blocked.

---

## Mocking Guidelines

### When to Mock

- External APIs (network calls)
- Database for unit tests
- Time-dependent functions
- Random number generators

### When NOT to Mock

- Core business logic
- Data transformations
- Utility functions

### Mock Example

```javascript
// Mocking Electron IPC
jest.mock('electron', () => ({
    ipcRenderer: {
        invoke: jest.fn()
    }
}));

describe('loadFolder', () => {
    test('handles file system errors gracefully', async () => {
        const { ipcRenderer } = require('electron');
        ipcRenderer.invoke.mockRejectedValue(new Error('Access denied'));

        const result = await loadFolder('/invalid/path');

        expect(result).toEqual([]); // Graceful handling
    });
});
```

---

## Quality Gates

### Before Commit

- [ ] All existing tests pass
- [ ] New tests written for new code
- [ ] Coverage meets minimum threshold
- [ ] No skipped tests without `@pytest.mark.skip(reason="...")

### Before Push

- [ ] Full test suite passes
- [ ] Integration tests pass
- [ ] Manual testing checklist completed

---

## Debugging Failed Tests

### Process

1. **Read the error message** — Often contains the answer
2. **Check test assumptions** — Is test setup correct?
3. **Isolate the failure** — Run single test with `-v`
4. **Add debugging output** — Use `pytest --capture=no`
5. **Check recent changes** — `git diff` against working state

### Common Issues

| Symptom | Likely Cause |
|---------|--------------|
| Test passes alone, fails in suite | Shared state pollution |
| Flaky test | Race condition or time dependency |
| Import error | Missing dependency or circular import |
| Assertion error on equal objects | `__eq__` not implemented |

---

*See [../WORKFLOW.md](../WORKFLOW.md) for how testing integrates with development phases.*
