# Isolated Atlas integration tests

The MongoDB-backed HTTP flows are in `tests/socialIntegration.test.js`. That test file alone loads `.env.test.local`; neither the development server nor the production server loads it. The test configuration is validated before the test calls `mongoose.connect` or performs database operations.

## Create the Atlas test target

1. Create a separate Atlas project and cluster for tests. Do not reuse the production cluster.
2. Create a test-only database user scoped to `readWrite` on `mkstudios_test`.
3. Restrict the test project's Network Access list to the IP address used to run tests.
4. Copy the driver URI from the test cluster. Use `mkstudios_test` as the explicit database name. Percent-encode special characters in the database username or password as Atlas requires.
5. Record the exact cluster hostname separately from the URI host.

## Configure locally

Create `C:\Users\<you>\Desktop\Project\.env.test.local` and put only these two settings in it:

```dotenv
MONGODB_TEST_URI=mongodb+srv://<test-user>:<encoded-password>@<test-cluster-host>/mkstudios_test?retryWrites=true&w=majority
MONGODB_TEST_ALLOWED_HOST=<test-cluster-host>
```

Replace the placeholders locally. Do not paste the URI into chat, source code, shell commands, or terminal history. `.env.test.local` is covered by `.env.*` in `.gitignore`; verify that with `git check-ignore .env.test.local` before adding any values. Do not put `MONGODB_URI` in this file.

When ready to run the full suite, use `npm.cmd test`. The integration test reads the local test file without printing its values. Before connecting, it requires both test settings, requires the database name to end in `_test`, requires the URI hostname to exactly match `MONGODB_TEST_ALLOWED_HOST`, and rejects a hostname equal to `MONGODB_URI` when that production setting is present in the test process environment. Validation errors and connection failures use non-sensitive messages.

The database-backed tests create fixture records in the test database and do not clear collections or drop the database. Keep the test cluster and database user dedicated to these tests.
