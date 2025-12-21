# GitHub Actions CI/CD

This directory contains GitHub Actions workflows for the wiki-framework.

## Workflows

### 1. Test Workflow (`test.yml`)

**Triggers**:
- Push to `main` or `dev` branches
- Pull requests to `main` or `dev` branches
- Manual trigger via workflow_dispatch

**What it does**:
- Runs tests on Node.js 18.x and 20.x
- Generates coverage report (Node 20.x only)
- Runs linter if configured
- Uploads coverage to Codecov
- Posts test summary to PR

**Jobs**:
1. **test**: Runs `npm test` on multiple Node versions
2. **lint**: Runs `npm run lint` (if configured)
3. **summary**: Aggregates results and posts summary

### 2. Coverage Workflow (`coverage.yml`)

**Triggers**:
- Push to `main` branch
- Manual trigger via workflow_dispatch

**What it does**:
- Generates detailed coverage report
- Posts coverage summary to PR (if applicable)
- Archives coverage report as artifact (30 days retention)
- Creates coverage summary in GitHub Step Summary

## Status Badges

Add these badges to your README.md:

```markdown
[![Tests](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/test.yml/badge.svg)](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/test.yml)
[![Coverage](https://codecov.io/gh/YOUR_ORG/YOUR_REPO/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_ORG/YOUR_REPO)
```

Replace `YOUR_ORG` and `YOUR_REPO` with actual values.

## Configuration

### Coverage Thresholds

Coverage thresholds are configured in `vitest.config.js`:

```javascript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80
  }
}
```

### Node.js Versions

The workflow tests on:
- Node.js 18.x (LTS)
- Node.js 20.x (LTS)

To add more versions, edit the matrix in `test.yml`:

```yaml
strategy:
  matrix:
    node-version: [18.x, 20.x, 22.x]
```

## Codecov Integration

To enable Codecov:

1. Sign up at https://codecov.io
2. Add your repository
3. Add `CODECOV_TOKEN` to repository secrets:
   - Go to Settings → Secrets and variables → Actions
   - Add new secret: `CODECOV_TOKEN`
   - Use token from Codecov dashboard

## Running Locally

To replicate CI behavior locally:

```bash
# Install dependencies
npm ci

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linter
npm run lint
```

## Troubleshooting

### Tests fail in CI but pass locally

**Possible causes**:
- Different Node.js versions
- Missing environment variables
- File path differences (case sensitivity on Linux)
- Timezone differences

**Solution**:
Run tests locally using the same Node version as CI:
```bash
nvm use 20
npm test
```

### Coverage upload fails

**Possible causes**:
- Missing `CODECOV_TOKEN` secret
- Codecov service issues

**Solution**:
The workflow is configured with `continue-on-error: true` for coverage uploads, so it won't fail the build. Check Codecov dashboard for issues.

### Workflow doesn't trigger

**Possible causes**:
- Workflow file syntax error
- Branch name doesn't match trigger configuration
- GitHub Actions disabled for repository

**Solution**:
1. Validate YAML syntax
2. Check Actions tab in repository
3. Enable Actions in Settings → Actions → General

## Best Practices

1. **Keep workflows fast**: CI should complete in < 5 minutes
2. **Cache dependencies**: Use `cache: 'npm'` in setup-node action
3. **Fail fast**: Stop on first failure in test matrix
4. **Clear error messages**: Include context in failure messages
5. **Minimal dependencies**: Only install what's needed for tests

## Integration with Parent Project

The parent project runs framework tests as part of its build:

```bash
npm run test:framework  # Runs framework tests
npm run test           # Runs framework + parent tests
```

The parent project's CI should:
1. Install framework dependencies
2. Run framework tests
3. Run parent tests
4. Deploy only if all tests pass

See parent project's `.github/workflows/` for parent CI configuration.

## Maintenance

### Updating Actions

GitHub Actions should be updated regularly:

```bash
# Check for action updates
# Update versions in workflow files
# Test locally if possible
```

Common actions used:
- `actions/checkout@v4` - Checkout code
- `actions/setup-node@v4` - Setup Node.js
- `actions/upload-artifact@v4` - Upload artifacts
- `codecov/codecov-action@v4` - Upload to Codecov

### Monitoring

Monitor CI health:
- Check Actions tab regularly
- Review failed workflows
- Update Node versions as needed
- Keep dependencies updated

## Security

### Secrets Management

Never commit secrets to workflows. Use GitHub Secrets:

```yaml
env:
  MY_SECRET: ${{ secrets.MY_SECRET }}
```

### Permissions

Workflows have minimal permissions by default. Grant only what's needed:

```yaml
permissions:
  contents: read
  issues: write  # For PR comments
```

## Support

For issues with GitHub Actions:
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest Documentation](https://vitest.dev/)
- [Codecov Documentation](https://docs.codecov.com/)
