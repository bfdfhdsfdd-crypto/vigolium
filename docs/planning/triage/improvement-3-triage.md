# Triage: improvement-3 (reliable CLI artifacts for coding agents)

Date: 2026-10-01  
Plan: `docs/planning/improvement-3.md`, written at `10c6fc8`.  
Checked against: `10c6fc8` (HEAD; no later commits). The uncommitted package-manager work (`pkg/cli/update.go`, `updatecheck.go`, `package_manager*.go`, `Makefile`, `.goreleaser.yaml`) is unrelated and treated as existing code.

Method: every F-item was re-read in source, and four parallel verifiers re-derived each claim independently. Several behaviors were confirmed with throwaway `go test -short -overlay` probes kept outside the repo. The repo was not modified.

**Verdict legend**

- **implement** — high value, well scoped, low-to-moderate risk, and testable with `go test -short` (no Docker, no live browser).
- **slice** — implement the minimal valuable part now and defer the rest.
- **defer** — needs a large redesign or a product decision, is speculative, or needs infrastructure we lack.
- **done/invalid** — already fixed, or the claim does not hold.

**Policy applied:** Phase A correctness repairs and additive, backward-compatible contract changes come first. No command renames, no schema-v2 receipt, and no default-lifetime change.

---

## Section A — Item-by-item verdicts

### A.1 Plan findings F01–F35

| ID | Title | Verdict | Reason / evidence |
|---|---|---|---|
| F01 | `--json` shape varies by path | slice → WP3 | Confirmed. `needsRunnerScan` (`scan_url.go:132-140`) chooses the path. The per-target loop (`scan_url.go:165-174`, stdin `:209-216`) calls `outputScanResult`→`writeAgentJSON` (`:970`) once per input, so 2+ targets print several indented documents. That breaks the documented "exactly one document" contract (`coding-agent.md:318`). `scanResult` (`:223-233`) has no `schema_version`. **Slice:** one envelope for multi-input; single-input shape unchanged. Unifying direct and runner output is deferred to schema v2. |
| F02 | Event selection not routed/isolated | implement → WP3 | Worse than stated. `--events` on scan-url/scan-request is **completely inert** (N01). `scan --events` combined with stdout JSONL, `--ci-output-format` or `--print-*` interleaves bulk rows into the event stream (N02). `output.go:299-307` only silences StandardWriter. |
| F03 | Direct path hides DB/exec failure | implement → WP2 | DB half confirmed: `scan_url.go:508` (`if dbErr == nil`) silently skips persistence, even when `--db`/`VIGOLIUM_DB_PATH`/`--config` pins a store. Exec half is low impact: `Executor.Execute` only errors on "already running" (`pkg/core/executor.go:737`), and `:649` appends the error and still returns the output result. |
| F04 | Export wrappers swallow errors | implement → WP2 | Confirmed. `maybeGenerateReports` (`scan.go:1488-1514`) and `finishFSExport` (`:1521-1540`) return nothing. Callers: `reportNativeScanSuccess` (`:883-895`), `scan_url.go:941-942`, and `exportUnifiedFromDB` (`scan_parallel.go:758-760`, whose own comment says losing output silently must not happen). A `--upload-results` failure is only a zap Warn (`storage_upload.go:79-91`), which is invisible at the default log level. |
| F05 | Streaming export publishes incomplete data | implement → WP4 | Confirmed. These sites warn and continue or return nil: scans/oast/scopes at `export.go:795-797, 871-873, 893-895`; finding refs at `926-928` (falls back to an empty set); records at `956-958, 978-981, 997-999`; findings at `1041-1043, 1049-1051, 1057-1059`. The best-effort policy comment is at `:768-770`. |
| F06 | JSON latch set before publication | implement → WP1 | Confirmed. `agentview.go:151` latches before `writeJSONResultToFile`, so a failed `-o` write leaves stdout empty and suppresses the error envelope (`agent_error.go:185-187`). Import prints its result (`cmd_import.go:278-285`) before the report and upload run (`:287-329`). `:327` and `:689` `fmt.Printf` to stdout under `-j`. `:516` and `:568` use a bare `json.NewEncoder(os.Stdout)` that never sets the latch, so a later failure appends a second JSON object. |
| F07 | Partial batch exit 0 | slice → WP2 | The partial-failure exit-0 policy is intentional (`scan_parallel.go:774-785`, pinned by `scan_parallel_test.go:182-195`) and is kept. Real bug: a child that trips `--fail-on` (exit 4) is counted as **failed** (`:540-551`). A partial gate trip then exits 0, and an all-gated run exits 1 instead of 4 (N03). |
| F08 | Watch has no terminal-error frame | implement → WP1 | Partly confirmed. After the first snapshot latches (`agentview.go:163`), a later error goes only to stderr (exit 1, or 0 with `--soft-fail`). A first-iteration error envelope is multi-line, because `db.go:57` resets stream mode first. |
| F09 | DB selection channel changes scope | slice → WP5 | Confirmed. `effectiveProjectUUID` returns `""` whenever `statelessReadRequested()` (`stateless_db.go:425-430`), so an explicit `--project-uuid`/`--project-name` is silently ignored under `-S` and under the `VIGOLIUM_DB_PATH` auto-stateless pin (`db_path_env.go:106-110`). **Slice:** an explicit project always filters. The env-vs-flag default-scope asymmetry is deferred (compat-sensitive per plan §12). |
| F10 | Extraction bypasses project filter | implement → WP5 | Confirmed. `traffic_extract.go:164` calls `GetRecordByUUID` with no project check (`repository_records.go:500-510`). The envelope (`:326-331`) lacks `project_scoped`. The help text promises "Always opens the source read-only" (`:61`), but nothing sets `clicommon.ReadOnlyRequested`. The correct pattern exists at `replay.go:598`. |
| F11 | Export scope differs per format/class | slice → WP5 | Confirmed. The persisted report is scan-scoped (`scan.go:1497-1501`), while post-scan JSONL (`:2043`) and fs (`:1528`) are project-wide. `streamHTTPRecords` ignores `scanUUID` when selecting rows (`export.go:945-951`). Worse, top-level `vigolium export` ignores explicit project flags entirely (N04). **Slice:** honor an explicit project in `export`. A per-run closure is deferred: records are reused across scans, so it needs a closure design. |
| F12 | Explicit config errors fall back | implement → WP8 | Confirmed and broader. Fallback sites: `clicommon/db.go:95-99` (silent zap Warn below default level); `scan.go:283-291` and `scan_url.go:798-806`, which print "Config file not found" even on a parse error; and about 25 more. One is destructive: `db_clean.go:293-297` (N10). `module_enable.go:136-137` saves to the wrong file (N11). |
| F13 | Discovery order / non-strict YAML | slice → WP8 | Confirmed. The home config wins (`loader.go:189-192`), and first-run init writes one before any command runs (`root.go:226-229`, `init.go:49-77`), so `./vigolium-configs.yaml` is effectively dead. `yaml.Unmarshal` is not strict (`loader.go:220`), and the shipped template already has unknown keys (`public/vigolium-configs.example.yaml:306` `whitebox`, `:438` `max_findings_per_module`). **Slice:** warnings plus a template fix; discovery order unchanged. |
| F14 | Follow-ups not fully pinned | implement → WP11 | Confirmed, plus N07. `read_context.go:42-54` pins only explicit project globals and ignores the active-project resolution. `--db` and `--config` stay relative. A JSONL `-S` read emits no `--db` (`clicommon/db.go:225-227`). Postgres emits `--db postgres` (`:159-162`). |
| F15 | Read-only varies by backend/schema | defer | Confirmed. Postgres read-only exists only as a comment (`clicommon/db.go:109-112`). Every writable open migrates the source (`:142`, `EnsureSchemaCurrent(context.Background())`). Schema repair detaches the deadline (`schema_ready.go:200`). This needs a backend matrix and a migration policy (plan §14 rows "Read-only PostgreSQL" and "Schema repair"). `--read-only` remains the non-migrating path. |
| F16 | JSONL is not lossless | slice → WP4 + WP16 | Confirmed. Records are URL-deduplicated (`export.go:975-988`) and findings are confirmed-only (`:1021`), yet `coding-agent.md:21-22` says "full fidelity" (so do `public/skills/vigolium-scanner/SKILL.md:50` and `references/agent-loop.md:42`). **Slice:** correct the docs and add opt-in `export --no-url-dedup`. Coverage profiles are deferred. |
| F17 | JSONL import buffered/selective | slice → WP7 | Confirmed and worse. The whole stream is buffered (`importer.go:365-369`), and line length is unbounded (`:432-434`). The findings batch error is ignored (`:464`); with nil results, `tallyFindingSaves` would index out of range. Errored findings are reported as "duplicates skipped" (`:244-247`, `cmd_import.go:537`). Re-import is **not idempotent**: a plain INSERT on the primary key (`repository_records.go:483`) fails mid-stream after earlier batches have committed (N18). **Slice:** idempotent insert, streamed record batches, a line cap, and truthful counts. Profiles and an identity map are deferred. |
| F18 | Glob reads silently partial | slice → WP7 | Confirmed and worse. A failing source is warned about and skipped (`stateless_db.go:557-559`), but it leaves **orphan rows**, which the next source's id range then claims (`:549-573`; N17). JSONL loads re-home rows to the default project (`:488, :550`). **Slice:** roll back a failed source, account per source in the envelope, and add opt-in `--glob-strict`. |
| F19 | Bundle not atomic/streaming | slice → WP4 | Confirmed. `os.Create` truncates first (`export_bundle.go:69`). The close error is ignored (`:73`). An HTML failure only warns (`:94-96`). Members are materialized in memory (`:55, :86, :236-249`). `db export --format bundle` has the same pattern (`db_export.go:438-439`). **Slice:** atomic publication and a required HTML member. Streaming members are deferred (W9). |
| F20 | FS export lacks generations | implement → WP10 | Confirmed. Files are written in place (`fsexport.go:97-116, 191-216`), and each index is written only if its tree was created (`:251-262`). Also N20: a stale `.resp.body` gets embedded into new finding markdown (`pkg/fsexport/render.go:120-125, 142-160`). |
| F21 | Atomicity/perm/durability conflated | slice → WP4 | Confirmed. `Write` leaves files at 0600. `WriteBytes` force-chmods 0644 even though its comment says "subject to umask" (`atomicfile.go:24-25, 62-67`). The parent directory is not fsynced after rename (`:72`). **Slice:** named outputs get creation-time perms (umask applies) and a best-effort directory sync. A default-privacy policy is deferred. |
| F22 | `-S` overloaded/inert | slice → WP5 | Confirmed. A hidden `-S` is injected on every command (`stateless_flag.go:80-87, 110-122`) and is a no-op on most of them, with no warning. `db ls -S` without `--db` lists **every project in the default DB** (`db_list.go:150, 276`; N15). `ingest -S=false` turns scan-on-receive on (`stateless_flag.go:57-62`; N16). **Slice:** fix both and warn on no-op `-S`. Retiring `-S` on server/ingest is deferred (Phase D). |
| F23 | `Changed` used as "enabled" | implement → WP5 (DB-pin sites) + WP11 (rest) | Confirmed. `statelessWriteRequested` (`db_path_env.go:58-64`): `scan --stateless=false` with `VIGOLIUM_DB_PATH` set drops the pin and writes to the **default DB** (N06), violating the CLAUDE.md pin rule. Same pattern in `readonly_flag.go:65-67` and `traffic.go:234`/`traffic_group.go:57-59`. Presentation recovery declares `ci-output-format` as a string (`presentation_mode.go:48`) while the real flag is a bool (`root.go:326`), and it returns early (`:35-37`). |
| F24 | Input limits/preservation differ | slice → WP13 | Confirmed. `--input-read-timeout 0` resolves to 3m (`stdin.go:30-35`), contradicting the help (`flag_helpers.go:29-30`) and `coding-agent.md:332`. scan-url/scan-request don't register the flag, yet the timeout error tells users to use it (`clicommon/stdin.go:102-104`). The request file is read unbounded (`scan_request.go:66`). `TrimSpace` corrupts trailing body bytes while `Content-Length` stays (`scan_request.go:72`; also `scan_url.go:197`, `scan.go:802`). |
| F25 | Input-mode registries drift | implement → WP13 | Confirmed. `input_modes.go:23-90` swaps nuclei's canonical name and alias relative to `source/file.go:122-134`, and omits `burp-project-config`. The `-I` help lists only 8 modes (`flag_helpers.go:25`). No test cross-checks the two tables. |
| F26 | Bootstrap too broad | slice → WP14 | Confirmed. Only `init` is exempt (`root.go:226`). `version`, `completion`, `__complete`, `strategy --json` and `module ls --json` all create `~/.vigolium`, the config, and the default DB (`init.go:82-106`), ignoring `--db`. Dependency needs are keyed on the leaf command name (`init.go:268-283`). **Slice:** skip discovery commands, and skip default-DB creation when a store is pinned. Phase-derived dependencies and skip-marker persistence (documented at `root.go:319`) are deferred. |
| F27 | Cancellation lifecycle | slice → WP12 | Confirmed and worse. With `--events`, only the trap catches SIGTERM (`scanevents/global.go:68-70`) while the runner handler is `os.Interrupt`-only (`scan.go:2153`), so **the scan never stops** (N09). The terminal `interrupted` event is emitted before finalization. The merge defer (`scan.go:659`) runs after `finishEvents` (`:718`), so the terminal status can contradict the exit code. Signals arriving before the runner exists are swallowed. |
| F28 | Event backpressure/delivery implicit | slice → WP12 | Confirmed. `Encode` runs under the mutex on unbuffered stdout (`events.go:228-254`), and write errors latch silently (`:251-252`). There is no `seq` and no `Err()`. Correction to the plan: a disconnected stdout consumer **kills the process via SIGPIPE**, because SIGPIPE is not handled anywhere. The comment at `events.go:242-245` is therefore false (N19). Bounded buffering is deferred. |
| F29 | Scratch age ≠ liveness | implement → WP6 | Confirmed. Directories are named `p<pid>-<rand>` (`scratch.go:154`), and the sweep checks mtime only (`:289-331`). A directory's mtime does not change when files inside it are written, so the doc premise at `:32-33` is false. The sweep runs at every command exit (`root.go:404, 445-454`). The deadline is checked only every 64 entries (`:306`). |
| F30 | Cleanup destroys recoverable data | implement → WP6 | Confirmed, with a concrete false promise. After a `--db-isolate` merge failure the CLI prints "results are preserved in the temporary database `<scratch path>`" (`scan.go:1868-1872`), but that file lives in process scratch, which `releaseScratch` deletes moments later (`root.go:404`; N12). The `-S` working DB is removed unconditionally (`scan.go:639-643`, `scan_url.go:823-827`). No retention flag exists. |
| F31 | No aggregate output bound | slice → WP15 | Arithmetic confirmed: 1/2 KiB body caps (`agentview.go:37-38`) × 20 records (`:57`) × 100 rows (`finding.go:141`) ≈ 6 MiB. **Slice:** an opt-in byte budget. The default waits for measurement (plan §6.4). |
| F32 | "Streaming" keeps dataset-size indexes | defer | Confirmed (`export.go:913-933, 975`; `fsexport.go:66-72, 140-142`), but the indexes are metadata-sized. Measure first (plan §9.3). |
| F33 | SQLite RO URI unescaped | slice → WP9 | Confirmed, and silently wrong. The DSN `file:%s?mode=ro…` is built unescaped (`db.go:273-276`). With `?` or `#` in the path, modernc splits the DSN, **creates an empty stray file** and reads empty tables; `%41` opens a different file. The read-write DSN (`db.go:383-385`) also truncates at `?`. `merge.go:173-182` already encodes paths. **Slice:** encode the path. The sidecar-reclaim race needs a lock design and is deferred: an in-process fcntl lock would release SQLite's own locks. |
| F34 | Docs/behavior drift | implement → WP16 | Confirmed in `coding-agent.md`: `:54-55` (calls scan-url "stateless" without `-S`), `:21-22`, `:116-122` (shows `findings` instead of `items`/`schema_version`), `:143-144` ("in-memory"), `:318`, `:332`, `:363-374`, `:69`. Also `guides/stateless-scan.md:129-132` and `server-mode/ingestion.md:260`. |
| F35 | Color forced; `IS_SANDBOX` set | defer | Confirmed (`root.go:162` → `terminal.go:94-95`; `root.go:185-187`). Both are deliberate and pinned by `colors_test.go:72`, so this is a product-policy change. |

### A.2 New findings (not in the plan)

| ID | Title | Verdict | Evidence |
|---|---|---|---|
| N01 | `scan-url`/`scan-request --events` inert | implement → WP3 | `buildPhaseOptions` (`scan_url.go:679-746`) never copies `scanOpts.Events`. `needsRunnerScan` (`:132-140`) omits it. `validateEventsFlag(opts.Events)` (`:780`) therefore always validates `""`, so even `--events bogus` is accepted. |
| N02 | `scan --events` stdout contamination | implement → WP3 | `finishScanJSONLExport` writes to stdout (`scan.go:2049`), and so do `maybePrintScanFindings`/`maybePrintScanTraffic` (`:891-892`). Only StandardWriter is suppressed (`output.go:306`). |
| N03 | `-P` loses the `--fail-on` outcome | implement → WP2 | A child exit 4 increments `failed` (`scan_parallel.go:547-550`). `parallelBatchError` has no gate class (`:774-785`). |
| N04 | `export` ignores an explicit project | implement → WP5 | `export.go:383` (`queryExportData(…, "", "")`), `:619`, `:707-719`. The `--project-uuid` help says it scopes all operations (`root.go:331`). The `{project-uuid}` placeholder names the active project (`storage_io.go:35-40`) while the content spans all projects. |
| N05 | `export -o` / `db export -o` not atomic | implement → WP4 | `os.Create(outputPath)` at `export.go:606` and `db_export.go:180, 439` truncates before the query runs. A failure leaves a partial file and the previous artifact is lost. |
| N06 | `--stateless=false` drops the DB pin | implement → WP5 | `db_path_env.go:62-63` checks `f.Changed`, then `:97-100` returns before setting `globalDB`, so the scan writes to the default/config DB. |
| N07 | Follow-up emits `--db postgres` or no `--db` | implement → WP11 | `clicommon/db.go:159-162` records the driver name as the path. `SetDBCache` records no path at all (`:225-227`). `read_context.go:42-44` emits whatever it finds. |
| N08 | Ctrl-C only skips the current scan-url target | implement → WP3 | `scan_url.go:635-644` registers `signal.Notify` per target and never calls `Stop`. The loop (`:165-174`) moves on to the next target. |
| N09 | SIGTERM ignored under `--events` | implement → WP12 | `global.go:68-70` registers SIGTERM, which disables default termination. `scan.go:2153` handles Interrupt only. |
| N10 | `db clean` reset deletes the default DB on a bad `--config` | implement → WP8 | `db_clean.go:293-297` falls back to defaults, then deletes the default SQLite file and its sidecars. |
| N11 | `module enable` saves to the wrong config | implement → WP8 | `module_enable.go:136-137` loads `--config` but writes `config.ConfigFilePath()`. |
| N12 | db-isolate "preserved" path is deleted | implement → WP6 | The DB is created in scratch (`scan.go:1787`), the hint names it (`:1868-1872`), and scratch is released at exit (`root.go:404`). |
| N13 | Runner path swallows the project error | implement → WP2 | `scan_url.go:719` (`if …; perr == nil`) silently files results into the default project. The direct path returns the error (`:530-532`). |
| N14 | `zap.L().Fatal` in `executeNativeScan` | implement → WP2 | `scan.go:847` exits via `os.Exit`, skipping defers, the JSON error and scratch release. |
| N15 | `db ls -S` leaks every project | implement → WP5 | `db_list.go:150` uses `getDB()` (no source requirement), then `:276` `effectiveProjectUUID()` returns `""`. |
| N16 | `-S=false` enables scan-on-receive | implement → WP5 | `stateless_flag.go:59-62` checks `Changed` only. |
| N17 | Glob orphan rows / misattribution | implement → WP7 | `stateless_db.go:549-573` neither advances nor rolls back the marks when a source fails. |
| N18 | JSONL re-import fails on a duplicate UUID | implement → WP7 | `repository_records.go:483` is a plain INSERT on PK `uuid`. SQLite merges use OR IGNORE. |
| N19 | SIGPIPE kills `--events` scans | slice → WP12 | Nothing calls `signal.Notify(SIGPIPE)`, so Go's default exits on EPIPE to fd 1. |
| N20 | Stale `.resp.body` reused by fs export | implement → WP10 | `pkg/fsexport/render.go:120-125` writes the body only when non-empty, and `:142-160` reads whatever file exists. |

### A.3 Proposals (§5–§9)

| ID | Proposal | Verdict | Reason |
|---|---|---|---|
| P5.1 | `ResolvedInvocation`/`ResolvedSelection`/`OutputPlan` | defer | Cross-cutting refactor. Phase A uses targeted helpers instead (`explicitProjectSelected`, `validateStdoutProtocol`, `flagOn`). |
| P5.2 | Command groups | defer (no-op) | Renames and reorganization are excluded by policy; the groups are descriptive only. |
| P5.3 | Flag rules 1–10 | slice | Rule 2 → `flagOn` (WP5/WP11). Rule 3 → stdout-conflict rejection (WP3). Rule 6 → zero-timeout semantics (WP13). Rules 9 and 10 are deferred. |
| P5.4 | Discoverable command spec | defer | New metadata system. `strategy --json` and the generated flags already exist. |
| P6.1 | One stdout protocol | slice → WP3 | Events exclusivity and a multi-input envelope. A JSONL footer/manifest is deferred. |
| P6.2 | Envelope v2 / receipt | defer | Needs schema negotiation and a new contract. Only additive v1 fields are added: `query_argv`, `glob_sources`, `output_budget`, `interrupted`, `persisted`. |
| P6.3 | Error design / precedence | slice → WP2 | Keep the existing codes. Surface the `-P` gate. Export failure still outranks the gate. Retry classification is deferred. |
| P6.4 | Byte budgets / compact JSON | slice → WP15 | Opt-in flag. Default compact encoding is deferred for compatibility. |
| P7.1 | Lifetime vs artifact table | slice → WP6 | Retention on db-isolate failure, plus opt-in `--keep-db-on-error`. |
| P7.2 | Publication protocol | slice → WP4, WP10 | Atomic single-file outputs and staged fs generations. Manifests are deferred. |
| P7.3 | Canonical SQLite artifact + manifest | defer | Needs a manifest schema and a finalization design (Phase B). `-S --format sqlite` with VACUUM INTO already exists (`scan.go:1984-2033`). |
| P7.4 | Format coverage matrix | defer (doc slice in WP16) | — |
| P8.1 | Input matrix / `input inspect` | slice → WP13 | Timeout, size bound, byte preservation, and a registry-derived listing. `input inspect` is deferred. |
| P8.2 | Provenance / `context --json` | defer | Needs origin tracking across the config overlay. |
| P8.3 | DB/access contract table | slice → WP5, WP8 | Explicit config and pinned sources fail closed. Read-only Postgres is deferred. |
| P9.1 | Concurrency guarantees | slice → WP6 | Scratch lease. Destination collision detection is deferred. |
| P9.2 | Cursor pagination | defer | Tie-breakers already exist (`database/query.go:585-590, 1149-1155`). Offset paging is adequate for immutable artifacts. |
| P9.3 | Performance measurements | defer | Needs fixtures and benchmarks, not `-short` tests. |
| P9.4 | Sensitive content | defer | Note: the resume manifest stores raw child flags, including auth headers (`scan_resume.go:61-68`). Review its file mode separately. |

### A.4 Workstreams W0–W12

| ID | Verdict | Mapping |
|---|---|---|
| W0 Contract inventory | slice | Each WP ships characterization tests; no standalone inventory doc. |
| W1 Truthful errors/outcomes | implement | WP1, WP2, WP4 (strict streams) |
| W2 Source/scope resolution | slice | WP5, WP8, WP11 |
| W3 Artifact publication | slice | WP4, WP10 (snapshot manifest deferred) |
| W4 Machine protocol | slice | WP3, WP12 (receipt v2 deferred) |
| W5 Disposable lifecycle | slice | WP6, WP12 |
| W6 Input consistency | slice | WP13 |
| W7 Import/interchange | slice | WP7 (profiles and cross-source transactions deferred) |
| W8 Discovery/provenance | defer | — |
| W9 Output/memory budgets | slice | WP15 (memory profiling deferred) |
| W10 Startup/dependency policy | slice | WP14 |
| W11 Compatibility/docs | slice | WP16, plus doc edits inside each WP |
| W12 Convenience | defer | — |

### A.5 §13 features

| # | Feature | Verdict | Reason |
|---|---|---|---|
| 1 | Terminal invocation receipt | defer | Needs schema v2. WP1–WP3 make the v1 outputs truthful first. |
| 2 | Artifact inspect/verify | defer | New command, and depends on the manifest. |
| 3 | Machine-readable command discovery | defer | Needs annotation metadata (P5.4). |
| 4 | Config/source explanation | defer | Needs origin tracking (P8.2). WP8's typed load errors are groundwork. |
| 5 | Input inspection | defer | WP13 fixes the shared reader first. |
| 6 | Total response-byte budget | slice → WP15 | — |
| 7 | Structured follow-up args | implement → WP11 | `query_argv` with absolute paths and pinned context. |
| 8 | Coverage profiles | slice → WP4 (`--no-url-dedup`) + WP16 docs | — |
| 9 | Required/optional artifact policy | implement → WP2, WP4 | Every requested output is required. |
| 10 | Compatibility contract + fixtures | slice → WP16 | Envelope key fixture test. A versioned schema directory is deferred. |

---

## Section B — Ordered work packages

### Conventions for every WP

- **Build and test.** Build with `make build` only. Run focused tests with `go test -short -run '<Names>' ./<pkg>/...`, and run `make test-unit` before merging. A WP that touches signals, goroutines or the scratch package must also pass `go test -race -short` on the packages it lists.
- **Output streams.** Human diagnostics go to stderr. Under `-j`, stdout carries exactly one document.
- **Reuse.** Use the existing helpers `writeAgentJSONToStdout`/`writeAgentJSON`, `codedErrorf`, `recordExportFailure` and `usageErrorf`. New error codes join the closed set in `agent_error.go`.
- **Scope and DB precedence.** Preserve `project_uuid` scoping and the DB precedence `--db` → `VIGOLIUM_DB_PATH` → config → default. A pinned source never falls back.
- **Test hygiene.** Tests in `pkg/cli` that touch package globals save and restore them in `t.Cleanup` and never use `t.Parallel`. Reuse `newExportTestDB`/`seedFindingAndRecord`/`captureStdout` (`scan_jsonl_export_test.go:23-75`) and `resetDBCacheForTest` (`finding_glob_records_test.go:307`).
- **Docs.** Each WP updates the doc lines it invalidates (`docs/coding-agent.md`, the skill references). WP16 is the final sweep.

### Dependencies and overlap

| WP | Depends on | Shares files with |
|---|---|---|
| WP1 | — | WP7 (`cmd_import.go`), WP15 (`agentview.go`) |
| WP2 | WP1 | WP3, WP6, WP12 (`scan.go`, `scan_url.go`) |
| WP3 | WP2 | WP6, WP12, WP13 (`scan_url.go`, `scan.go`, `scan_request.go`) |
| WP4 | — | WP5 (`export.go`, `export_bundle.go`), WP8 (`db_export.go`) |
| WP5 | WP4 (`export.go`) | WP7 (`stateless_db.go`, `importer.go`), WP11 (consumers of `read_context.go`) |
| WP6 | WP2 | WP12 (`scan.go` defers), WP13 (`flag_helpers.go`) |
| WP7 | WP5 | WP1, WP8 (`cmd_import.go`), WP15 (`agentview.go`) |
| WP8 | — (land after WP2/WP3 to limit conflicts) | WP2/WP3 (`scan.go:283`, `scan_url.go:798`), WP4 (`db_export.go`) |
| WP9 | — | — |
| WP10 | — | WP5 (callers pass `filters.ProjectUUID`) |
| WP11 | WP5 | — |
| WP12 | WP2, WP3, WP6 | — |
| WP13 | WP3 | — |
| WP14 | — | WP5 (`root.go` PersistentPreRunE) |
| WP15 | WP1 | — |
| WP16 | all | docs only |

WP4, WP8, WP9, WP10 and WP14 can proceed in parallel with WP1–WP3.

---

### WP1 — One machine document, always (F06, F08, import output)

~300 lines. **Files:** `pkg/cli/agentview.go`, `pkg/cli/agent_error.go`, `pkg/cli/db.go`, `pkg/cli/cmd_import.go`, tests.

**1. Latch after publication.** Delete `jsonResultEmitted = true` at `agentview.go:151` in `writeAgentJSON`. `writeJSONResultToFile` → `writeAgentJSONToStdout(receipt)` already latches after the receipt is written (`:163`). Result: when `atomicfile.WriteBytes` fails, the root handler emits the `ok:false` envelope (code `failed`, message `write <dest>: …`) on stdout.

**2. Watch error frame.**
- Add `var jsonStreamFramed bool` next to `jsonStreamMode` (`agentview.go:193`).
- In `runWithWatch` (`db.go:53-58`), when stream mode is entered, also set `jsonStreamFramed = true`. Never reset it.
- In `emitJSONError` (`agent_error.go:176-214`), replace `if jsonResultEmitted { return }` with `if jsonResultEmitted && !jsonStreamFramed { return }`.
- When `jsonStreamFramed` is set, encode compactly: set `jsonStreamMode = true` before calling `writeAgentJSONToStdout`.
- Ctrl-C still returns nil, so no frame is written on interrupt.

**3. Import emits its result last.**
- Refactor `printImportResult`/`printMergeResult` (`cmd_import.go:481-590`) so the JSON branches return a `map[string]any` (`importResultJSON`, `mergeResultJSON`) instead of encoding. The human branches are unchanged and still print immediately.
- In the RunE (`:274-330`), under `globalJSON`, hold the map:
  - after the report succeeds, add `"report_path": <abs path>`;
  - after each successful upload, append to `"uploaded_to": []string`;
  - finally call `writeAgentJSONToStdout(out)`.
- Gate the `fmt.Printf` calls at `:327` and `:689` behind `if !globalJSON`. Human mode keeps writing them to stdout as today.
- Net effect: a report or upload failure produces a single error envelope, never an ok-result followed by an error.

**Tests**
- `TestWriteAgentJSONFileFailureLeavesErrorEnvelope`: `jsonOutputPath` points inside a missing dir and `globalJSON=true`. `writeAgentJSON` returns an error, `jsonResultEmitted==false`, and `emitJSONError` then writes one document (checked with `captureStdout`).
- `TestWatchErrorFrameIsOneLine`: `globalJSON=true`, `globalWatchRaw="10ms"`; the fn writes an envelope on the first call and errors on the second. After `runWithWatch` returns, call `emitJSONError`. Expect exactly 2 stdout lines, each valid JSON, the second with `"ok":false`.
- `TestImportJSONEmitsSingleDocumentAfterReport`: make `uploadImportSource` a package var and stub it to fail. On failure, stdout holds zero result documents (the root envelope follows). On success, stdout holds one document that contains `uploaded_to`.

**Compat:** import JSON gains `report_path` and `uploaded_to` (additive). On failure, import no longer prints a success object.

---

### WP2 — Requested outputs and pinned storage must succeed (F03, F04, F07 slice, N03, N13, N14)

~450 lines. **Files:** `pkg/cli/scan.go`, `pkg/cli/scan_url.go`, `pkg/cli/scan_parallel.go`, `pkg/cli/storage_upload.go`, `pkg/cli/exit_codes.go`; tests (`scan_export_outcome_test.go`, `scan_parallel_test.go`, new `scan_url_direct_test.go`).

**1. `maybeGenerateReports(db, opts) error`** (`scan.go:1488`). Join per-format failures as `fmt.Errorf("generate %s %s: %w", rf.label, outPath, err)`. Drop the inline "Failed to generate" print, because the root handler renders the error (same rationale as `finishStatelessExport`, `:1597-1607`). Keep the success line.

**2. `finishFSExport(db, opts) error`** (`:1521`). Return `fmt.Errorf("export fs tree: %w", err)`.

**3. `uploadNativeScanResults(...) error`** (`storage_upload.go:73-76`).
- `doUploadNativeScanResults` returns an error when `opts.UploadResults` is set and storage is disabled, the client fails, or the upload fails. `UploadResults` comes only from the flag (`scan_flags.go:115`).
- `webhook.FireNativeScan` stays best-effort.

**4. `reportNativeScanSuccess(...) error`** (`:883`).
- Return `errors.Join(reports, fs, upload)`. Still run the summary, the prints, and `evaluateFailOnGate`.
- At the callers (`:834, :872, :1267, :1294`): `var e error; recordExportFailure(&e, reportNativeScanSuccess(...)); return e`.
- Add `isExportFailure(err) bool` in `exit_codes.go` (an `errors.As` on a codedError with `errCodeExportFailed`).
- Change the persisted-JSONL defer guard at `scan.go:760` from `if err != nil && !scanOpts.Stateless` to `if err != nil && !scanOpts.Stateless && !isExportFailure(err)`, so one failed format does not cancel the JSONL format.
- Apply the same guard change to the runner defer in `scan_url.go` (around `:905`).

**5. `runRunnerScan`** (`scan_url.go:940-950`). Call `recordExportFailure(&err, errors.Join(maybeGenerateReports(db, opts), finishFSExport(db, opts)))`, continue to the summary and gate, and end with `return err` instead of `return nil`.

**6. `exportUnifiedFromDB`** (`scan_parallel.go:752-766`). `return errors.Join(maybeGenerateReports(…), finishFSExport(…), finishScanJSONLExport(…))`.

**7. Direct-path storage** (`scan_url.go:505-533`). When `getDB()` fails:
- If `strings.TrimSpace(globalDB) != "" || strings.TrimSpace(globalConfig) != ""`, the store is explicit (`VIGOLIUM_DB_PATH` is already folded into `globalDB`). Return `fmt.Errorf("database unavailable: %w", dbErr)` before any network work.
- Otherwise, unless `--silent`, print `<warn> database unavailable — results will not be persisted: <err>` to stderr.
- Add `Persisted bool \`json:"persisted"\`` to `scanResult` (`:223`) and set it to `repo != nil`.
- After `outputScanResult`, return `execErr` if it is non-nil. The latch prevents a second document; the exit code is 1.

**8. N13.** In `buildPhaseOptions` (`scan_url.go:719`), return `nil, perr` when `resolveProjectUUID()` fails.

**9. N14.** Replace `zap.L().Fatal` (`scan.go:847`) with `return fmt.Errorf("failed to create scan runner: %w", err)`.

**10. `-P` gate accounting** (`scan_parallel.go`).
- Add `gated bool` to `targetResult`, and `childTrippedGate(err) bool` (`errors.As(err, &exitErr) && exitErr.ExitCode() == ExitFailOnGate`).
- In `fanOutTargetScans` (`:540-551`), a gated child is neither failed nor interrupted: print `done (gate tripped)` and read its stats as for a success.
- `onComplete` (`:432-441`) marks gated targets done in the resume manifest.
- Change the signature to `parallelBatchError(failed, interrupted, gated, total int) error`. Keep the existing rules first, then add `if gated > 0 { return gateError{fmt.Errorf("--fail-on: %d of %d targets tripped the severity gate", gated, total)} }`.
- `printParallelSummary` lists gated targets separately from failures.
- `--soft-fail` is already forwarded to children by `childScanArgs` (`:1002-1043`), so children exit 0 under it. That stays unchanged.

**Tests**
- `TestMaybeGenerateReportsReturnsFailure`: unwritable dir, `opts.Output` set, format html.
- `TestFinishFSExportReturnsFailure`.
- `TestReportFailureDoesNotSkipJSONLExport`: an `isExportFailure` unit test plus a guard-level test.
- `TestDirectScanPinnedDBFailureIsFatal`: extract the DB-acquire branch into `acquireDirectScanDB() (*database.Repository, string, error)` so it is testable without network. `globalDB` set to a directory path → error. Empty `globalDB`/`globalConfig` → nil repo and no error.
- `TestParallelBatchErrorGate`: `(0,0,2,5)` → `classifyExitCode == ExitFailOnGate`; `(4,0,1,5)` → gate; `(5,0,0,5)` → code 1. Existing cases keep their outcomes (update the call arity).
- `TestChildTrippedGate`: helper-process pattern, `os.Args[0] -test.run=TestHelperExit4` with an env guard that calls `os.Exit(4)`.

**Compat**
- Runs that silently lost a report, fs tree or upload now exit 1 with `export_failed`. Export failure outranks the gate, which matches the documented contract (`coding-agent.md:308-316`).
- `-P --fail-on` batches now exit 4 when any child trips the gate. Before, they exited 0, or 1 when every child tripped.
- scan-url with a broken pinned DB now fails instead of scanning without persisting.

---

### WP3 — One stdout protocol for scan commands (F01, F02, N01, N02, N08)

~450 lines. **Files:** `pkg/cli/scan_url.go`, `pkg/cli/scan_request.go`, `pkg/cli/scan.go`, new `pkg/cli/stdout_protocol.go`; tests (`scan_lightweight_io_test.go`, new `stdout_protocol_test.go`, `scan_url_direct_test.go`).

**1. Wire `--events` into the lightweight commands.**
- `buildPhaseOptions`: add `opts.Events = scanOpts.Events`.
- `needsRunnerScan` (`scan_url.go:132`): add `|| strings.TrimSpace(scanOpts.Events) != ""`.
- In `runScanURLCmd` and `runScanRequestCmd`, right after `validateGlobalFormats()`, add `if err := validateEventsFlag(scanOpts.Events); err != nil { return asUsageError(err) }`.

**2. `validateStdoutProtocol(opts *types.Options) error`** (new file).
- Returns nil when `opts.Events == ""`.
- Otherwise returns `usageErrorf` naming the conflicting flag when any of these hold:
  - `opts.CIOutput`;
  - `opts.HasFormat("jsonl") && opts.Output == ""` — bulk JSONL to stdout. This also covers `--json`, which `reconcileOutputFormats` maps to jsonl (`scan.go:1419-1421`);
  - `scanPrintFinding || scanPrintTraffic || scanPrintTrafficTree`.
- Message pattern: `--events owns stdout; --format jsonl without -o would also write there. Add -o <file> or drop --events`.
- Call it in `runScanCmd` right after `reconcileOutputFormats(scanOpts)` succeeds (`scan.go:218`), and in `runRunnerScan` after `validateEventsFlag` (`scan_url.go:780`).

**3. One invocation context.**
- Remove the per-call `signal.Notify` block (`scan_url.go:635-644`).
- In `runScanURLCmd` and `runScanRequestCmd`, create `ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)` once, with `defer stop()`.
- Split `runScanWithRR` into:
  - `executeDirectScan(ctx, rr, target, method) (*scanResult, error)`, which covers everything through gate evaluation;
  - a thin `runScanWithRR` that executes and then calls `outputScanResult`.
- Add `Interrupted bool \`json:"interrupted,omitempty"\`` to `scanResult`, set when `ctx.Err() != nil` after `Execute`.

**4. Multi-input aggregation.**
- In `runScanURLCmd`, first build `[]scanInput{rr, target, method}` from the targets (`:165-174`) or from the stdin items (`:209-216`).
- Add `scanInputs(ctx, inputs, fn) (results []*scanResult, notScanned []string, err error)`. It stops dispatching once `ctx.Err() != nil`. `fn` is injectable for tests.
- When `!needsRunnerScan() && globalJSON && !globalCIOutput && len(inputs) > 1`, emit a single `newAgentEnvelope(commandPathWithoutRoot(cmd), "", results, int64(len(results)), 0, len(results))` with `.With("targets_not_scanned", notScanned)`, via `writeAgentJSON`.
- In every other case, keep dispatching each input separately, but break the loop when `ctx.Err() != nil`. The runner path's own handler also sees the signal.

**Tests**
- Extend the `TestNeedsRunnerScan` table with an events case.
- `TestBuildPhaseOptionsCopiesEvents`.
- `TestValidateStdoutProtocol`: events+ci → error; events+jsonl without `-o` → error; events+jsonl+`-o` → ok; events+print-finding → error; no events → ok.
- `TestScanInputsStopsOnCancel` (run with `-race`): a fake fn cancels ctx on its first call. The second input lands in `notScanned`, and fn runs only once.
- `TestDirectMultiInputSingleDocument`: render 2 fake results via the aggregation helper under `captureStdout`. One `json.Decoder.Decode` succeeds, and the next returns `io.EOF`.
- Race command: `go test -race -short -run 'TestScanInputs|TestDirectMultiInput' ./pkg/cli/`.

**Compat**
- Single-input JSON shape is unchanged, apart from the optional `interrupted` field (and `persisted` from WP2).
- Multi-input `--json` changes from concatenated documents, which were invalid under the documented contract, to one envelope with `items`.
- `--events` on scan-url/scan-request now works, and an invalid value exits 2.
- `scan --events` combined with stdout JSONL, CI output or a print mode now exits 2. Before, it produced a corrupt stream.
- Update `coding-agent.md:68-69` and the events docs.

---

### WP4 — Export integrity: strict reads, atomic publication (F05, F16 flag, F19, F21, N05)

~550 lines. **Files:** `internal/atomicfile/atomicfile.go` (+tests, new `atomicfile_unix_test.go`), `pkg/cli/export.go`, `pkg/cli/db_export.go`, `pkg/cli/export_bundle.go`; tests (`streaming_export_test.go`, `export_format_test.go`).

**1. atomicfile.**
- Add `WriteFile(path string, perm os.FileMode, write func(*bufio.Writer) error) error`:
  - create the temp file with `os.OpenFile(filepath.Join(dir, "."+base+"."+hex8+".tmp"), O_WRONLY|O_CREATE|O_EXCL, perm)`, retrying up to 10 times on `fs.ErrExist`, so the umask applies at creation;
  - then write → flush → `Sync` → `Close` → `Rename` → `syncDir(dir)`.
- `syncDir` is best-effort: open the dir, `Sync`, ignore errors. It is a no-op when `runtime.GOOS == "windows"`.
- `Write` keeps the `CreateTemp` 0600 behavior and also gains `syncDir`.
- `WriteBytes` becomes `WriteFile(path, 0o644, …)`. Remove the `Chmod` (`:62-67`) and fix the comment (`:24-25`).

**2. Strict streaming** (`export.go`). Each site listed under F05 returns a wrapped error instead of warning:
- scans, oast and scopes: `fmt.Errorf("export scans: %w", err)` and equivalents;
- `findingReferencedRecordUUIDs` returns `(map[string]struct{}, error)`;
- `streamHTTPRecords` and `streamFindings`: query errors, `ScanRow` errors and `rows.Err()` all return.
- Rewrite the comments at `:768-770`, `:907-912`, `:938-944` and `:1011-1014` to say "strict".
- The host-facts missing-count warning (`:1003-1007`) stays informational.

**3. Atomic `export -o`.**
- `exportRun.exportJSONL` (`export.go:603-612`): when `outputPath != ""`, wrap both the streaming and the materialized branch in `atomicfile.WriteFile(outputPath, 0o666, …)`. Mode 0o666 under the umask reproduces the old `os.Create` permissions. Stdout output is unchanged.
- `db export` (`db_export.go:177-188`): when `-o` is set and `--watch` is not, run the single iteration inside `atomicfile.WriteFile(exportOutput, 0o666, …)`.
  - Change `exportJSONL/exportJSON/exportRaw/exportCSV/exportMarkdown/exportMarkdownTable` (`:247-433`) to take `io.Writer`.
  - `-o` with `--watch` keeps today's behavior (document it).
- `db_export.go` `exportBundle` (`:438`): wrap the tar/gzip stream in `atomicfile.WriteFile(exportOutput, 0o666, …)` and return the errors from `tw.Close` and `gz.Close`.

**4. Bundle** (`export_bundle.go`).
- Replace `os.Create` and the deferred closes (`:69-78`) with `atomicfile.WriteFile(outputPath, 0o666, func(w) { gz := gzip.NewWriter(w); tw := tar.NewWriter(gz); …; return errors.Join(tw.Close(), gz.Close()) })`.
- An HTML render failure (`:94-96`) now returns `fmt.Errorf("render report.html for bundle: %w", err)`.
- `renderHTMLToBytes` uses `scratch.CreateTemp` instead of `os.CreateTemp("")` (`:237`).
- Add the package var `renderBundleHTML = renderHTMLToBytes` for tests.
- In-memory member materialization stays (deferred, F32).

**5. `export --no-url-dedup`** (F16 slice).
- Add the global `topExportNoURLDedup`, registered in `export.go:55-88` with help: "Emit every stored HTTP exchange; by default exchanges sharing a URL collapse to the first one (plus any a finding links to)".
- In `streamHTTPRecords`, when it is set, skip the `seen` check and the `findingReferencedRecordUUIDs` query.
- Post-scan exports never set it.
- Add one sentence to the `export` Long help stating JSONL coverage: URL-deduplicated records, confirmed findings only, not a lossless archive.

**Tests**
- atomicfile:
  - `TestWriteBytesHonorsUmask` (unix build tag): `syscall.Umask(0o077)` → 0600, `0o022` → 0644. Restore the umask in cleanup.
  - `TestWriteFailureKeepsPrevious`: the write fn errors; old content is intact and no `.*.tmp` remains.
  - `TestWriteKeeps0600`.
- `TestStreamExportFailsOnClosedDB`: `newExportTestDB`, seed, `db.Close()`, then `streamJSONLExport` into a buffer returns an error.
- `TestStreamExportFailsOnUnreadableFindings`: `DROP TABLE findings` → error.
- `TestExportJSONLKeepsPreviousFileOnFailure`: pre-write `"old"`; a closed DB → error; the content is still `"old"`.
- `TestDBExportAtomic`: same, via an extracted `writeDBExport(ctx, db, filters, format, w)`.
- `TestExportBundleRequiresHTML`: override `renderBundleHTML` to fail → error; the previous bundle bytes are unchanged.
- `TestExportBundleKeepsPreviousOnSessionFailure`: an unreadable session file (`chmod 000`; skip as root) → error; previous bytes unchanged.
- `TestStreamHTTPRecordsNoURLDedup`: 2 records with the same URL → 1 by default, 2 with the flag.

**Compat**
- An export that hits a DB read error now fails (exit 1, `export_failed`) and keeps the previous file. It used to publish a partial file and exit 0.
- `export -o` and `db export -o` file modes are unchanged.
- `WriteBytes` outputs become more private under a restrictive umask.
- A bundle without its HTML report now fails.

---

### WP5 — Project scope and pinned-source correctness (F09 slice, F10, F11 slice, F22 slice, F23 DB-pin sites, N04, N06, N15, N16)

~500 lines. **Files:** new `pkg/cli/flag_value.go`, `pkg/cli/db_path_env.go`, `pkg/cli/stateless_flag.go`, `pkg/cli/readonly_flag.go`, `pkg/cli/stateless_db.go`, `pkg/cli/root.go`, `pkg/cli/traffic_extract.go`, `pkg/cli/db_list.go`, `pkg/cli/export.go`, `pkg/cli/export_bundle.go` (manifest field), `pkg/dbimport/importer.go`, `pkg/cli/internal/clicommon/project.go`, tests.

**1. `flagOn(cmd, name) bool`.** True when the flag exists, is `Changed`, and (for bool types) `Value.String() == "true"`. Use it in:
- `statelessWriteRequested` (`db_path_env.go:62-63`) — fixes N06;
- `applyDeprecatedScanOnReceive` (`stateless_flag.go:59`) — set scan-on-receive, and warn, only when the value is true. Fixes N16;
- the writer-flag loop in `applyReadOnlyMode` (`readonly_flag.go:65-67`).

**2. An explicit project is always a filter.**
- Add `explicitProjectSelected() bool`: `TrimSpace(globalProjectUUID) != "" || TrimSpace(globalProjectName) != ""`. The env vars are already folded in at `root.go:197-201`; also record `projectFromEnv bool` there.
- `effectiveProjectUUID` (`stateless_db.go:425`): under `statelessReadRequested()`, return `resolveProjectUUID()` if `explicitProjectSelected()`, else `""`.
- When the project came from the env, print one stderr notice (not in machine mode): `project filter <uuid> from $VIGOLIUM_PROJECT_* applied to a stateless read`.
- Precondition: callers open the read DB before resolving, so a name lookup hits the source. Verified for `finding.go:266→522`, `traffic.go:311→456`, `replay.go:560→598`, and `log.go`; `db_list.go` satisfies it after step 5. Document this in the function comment.
- Add `clicommon.ResetProjectResolutionForTest()`, which resets the `sync.Once`, the value and the error.

**3. JSONL sources keep their project.**
- Add `dbimport.Options.PreserveProjectUUID bool`. In `ImportJSONL` (`importer.go:390, :408`), assign `projectUUID` only when `!(opts.PreserveProjectUUID && <row>.ProjectUUID != "")`.
- Pass `PreserveProjectUUID: true` from `loadStatelessJSONL` (`stateless_db.go:488`) and from `openGlobDB`'s `ImportPath` options (`:550-554`). Confirm that `ImportPath` forwards Options to `ImportJSONL`.
- Persistent `vigolium import` is unchanged: it still re-homes rows.

**4. Extraction** (`traffic_extract.go`).
- After a successful `GetRecordByUUID` (`:164`), call `pid, err := effectiveProjectUUID()`. If `pid != "" && record.ProjectUUID != pid`, return the same `errCodeRecordNotFound` error, so existence in another project is not revealed (the pattern at `replay.go:598`).
- Add `ProjectScope string` to `extractedMessage`. `newExtractEnvelope` calls `.WithProjectScope(msg.ProjectScope)`.
- Change the help at `:61` to: "Never re-sends the exchange; pass --read-only to open the source without modifying it." (Decision C21.)

**5. `db ls`** (`db_list.go:150`). Replace `getDB()` with `openReadDB(globDBSkipSet{})`. `-S` without `--db` now errors, and JSONL sources work.

**6. `export` honors an explicit project** (N04).
- Add `exportRun.projectUUID`, resolved once in `openDB()`: `if explicitProjectSelected() { resolveProjectUUID() } else { "" }`.
- Use it in:
  - `loadItems`: `queryExportData(ctx, db, …, r.projectUUID, "")`;
  - streaming `exportJSONL`: `streamJSONLExport(…, r.projectUUID)`;
  - `exportFS`: `filters.ProjectUUID`;
  - the bundle, which inherits it through `loadItems`; also write it into the bundle manifest's `project_uuid`.
- The stderr summary prints `Project: <uuid>` or `Project: all (no --project-uuid/--project-name)`.
- The default stays whole-DB (C23).

**7. No-op `-S` warning.**
- `addStatelessShorthand` (`stateless_flag.go:110-122`) records the commands it injects into, in `statelessInjected map[*cobra.Command]bool`.
- In `PersistentPreRunE`, when `globalStateless` is set and the command is injected but is not one of the readers (`log`, `log ls`, `fuzz`, `db list`), print to stderr (not in machine mode): `-S/--stateless has no effect on "<path>" and is ignored`.
- Rejecting instead of warning is deferred (C24).

**Tests**
- In `db_path_env_test.go`: `--stateless=false` plus the env var → `globalDB == envPath`.
- `TestDeprecatedScanOnReceiveFalse`: `ingest -S=false` → `globalScanOnReceive == false`.
- `TestReadOnlyAcceptsWriterFlagFalse`: `traffic --read-only --save-to-vigolium-db=false` → no error.
- `TestEffectiveProjectUUIDStatelessExplicit`: `globalStateless` with `globalProjectUUID="P"` → `"P"`; unset → `""`.
- `TestTrafficBodyCrossProjectNotFound`:
  - seed two projects with `seedFindingAndRecord(t, db, "projA", "a")` and `"projB","b"`;
  - set `globalDB` to the file and `globalProjectUUID="projA"`;
  - `loadExtractTarget` for `rec-b` → `errCodeRecordNotFound`; for `rec-a` → ok.
- `TestExportExplicitProjectFilters`: streamed JSONL contains only projA rows; without the flag it contains both.
- `TestImportJSONLPreserveProject`.
- `TestDBListStatelessRequiresSource`.

**Compat**
- An explicit project flag or env var under `-S` now filters; it was ignored before. A notice is printed when it came from the env.
- `export --project-uuid` now filters.
- `traffic body --uuid` for a record in another project returns `record_not_found`.
- `db ls -S` without `--db` errors.
- Unscoped `-S` reads of JSONL now show each row's original `project_uuid`.

---

### WP6 — Recovery honesty and scratch ownership (F29, F30, N12)

~500 lines. **Files:** new `pkg/cli/recover_db.go`, `pkg/cli/scan.go`, `pkg/cli/scan_url.go`, `pkg/cli/scan_flags.go`, `pkg/cli/flag_helpers.go`, `internal/scratch/scratch.go`, new `internal/scratch/lease_unix.go` (`//go:build unix`) and `lease_other.go` (`//go:build !unix`), tests.

**1. `preserveWorkingDB(path, kind string) (string, error)`.**
- Destination dir: `config.ExpandPath("~/.vigolium/recovered")`, created with `MkdirAll` at mode 0o700.
- File name: `<kind>-<UTC 20060102T150405Z>-<base(path)>`.
- Move the main file plus any existing `-wal`/`-shm` with `os.Rename`. If any rename fails, fall back to copying (`io.Copy`, `Sync`, mode 0600) and then removing the original.
- Return the absolute destination path.

**2. db-isolate.** `dbIsolateMergeFailed` (`scan.go:1868`) calls `preserveWorkingDB(scratchPath, "isolate")`.
- On success, print `results preserved at <dest>; merge later with: vigolium import --db <destDB> <dest>`, and return `fmt.Errorf("db-isolate merge failed (results kept at %s): %w", dest, mergeErr)` (or wrap `scanErr` when that is the error being returned).
- On failure, print `results could NOT be preserved: <err>`.
- The word "preserved" is never printed next to a scratch path.

**3. `--keep-db-on-error`** (bool, global `globalKeepDBOnError`).
- Register it on scan/run (`scan_flags.go`, next to `--stateless` at `:118`) and on scan-url/scan-request (`registerLightweightScanIOFlags`, `flag_helpers.go:89`).
- Without `-S` it is a usage error, validated in `runScanCmd` and `runRunnerScan`.
- Change the stateless removal defers (`scan.go:639-643`, `scan_url.go:823-827`). These run last, after `db.Close`. When `err != nil && globalKeepDBOnError`, preserve the DB and set `err = fmt.Errorf("%w (working database kept at %s; inspect with: vigolium finding -S --db %s)", err, kept, kept)`. Wrapping with `%w` keeps the codedError classification.
- `-P` children inherit the flag through `childScanArgs`.

**4. Scratch lease** (`internal/scratch`).
- `lease_unix.go`:
  - `acquireLease(dir) (*os.File, error)`: open `dir/.lease` with `O_CREATE|O_RDWR` at 0600, then `syscall.Flock(fd, LOCK_EX|LOCK_NB)`.
  - `leaseHeld(dir) (held, known bool)`: open `dir/.lease`; if it is missing, return `known=false`. Try `Flock(LOCK_EX|LOCK_NB)`: `EWOULDBLOCK` means held. Otherwise unlock, close, and return `held=false, known=true`.
  - `pidAlive(pid) bool`: `syscall.Kill(pid, 0)` returns nil or `EPERM`.
- `lease_other.go`: no-ops (returns `nil`; `false,false`; `false`). Windows stays age-only.
- `ensureLocked` (`scratch.go:145-160`): after `MkdirAll`, `leaseFile, _ = acquireLease(path)` (best-effort).
- `Release` (`:225-238`) closes the lease before `RemoveAll`. `reprovision` closes the old lease.
- `sweepDir` (`:289-331`), for root-level names matching `^p(\d+)-[0-9a-f]{8}$` only:
  - skip the dir if `leaseHeld` reports held;
  - if the lease is unknown, skip it when `pidAlive(parsed pid)`;
  - check `deadline` immediately before every `RemoveAll`, in addition to the existing `i%64` check.
- Fix the package doc premise (`:32-33`).

**Tests**
- `TestPreserveWorkingDBMovesSidecars`: temp HOME; create `x.sqlite` and `x.sqlite-wal`; preserve. Both are moved, at mode 0600.
- `TestDBIsolateMergeFailureKeepsFile`: `scratch.Acquire()`; create a scratch DB; `finishDBIsolateMerge` with the destination in an unwritable dir (skip as root); `scratch.Release()`. The path named in the error still exists.
- `TestKeepDBOnErrorRequiresStateless`.
- `internal/scratch`:
  - `TestSweepSkipsLeasedDir`: create a root-level `p<pid>-deadbeef` dir and `acquireLease` it in-process. That is enough to test with, because flock locks belong to the open file description, so the sweeper's second open conflicts. Backdate the mtime with the existing test helper. `sweepDir` keeps the dir; after the lease is closed, it removes it.
  - `TestSweepKeepsLivePIDLegacyDir`: `p<os.Getpid()>-…` with no lease is kept.
  - `TestSweepRemovesDeadPIDLegacyDir`: use the pid of an exited `exec.Command(os.Args[0], "-test.run=^$")`.
  - `TestConcurrentAcquireReleaseSweep`: goroutines call `CreateTemp`, `Release`, `Acquire` and `sweepDir` concurrently.
- Race command: `go test -race -short ./internal/scratch/... && go test -race -short -run 'TestPreserveWorkingDB|TestDBIsolateMergeFailure' ./pkg/cli/`.

**Compat:** `--keep-db-on-error` is additive. The recovered dir is never auto-swept; document it as manual cleanup. A live process's scratch is no longer swept.

---

### WP7 — Import and glob-merge integrity (F17 slice, F18 slice, N17, N18)

~550 lines. **Files:** `pkg/database/repository_records.go`, `pkg/dbimport/importer.go` (+`importer_test.go`), `pkg/cli/stateless_db.go`, `pkg/cli/agentview.go` (envelope hook), `pkg/cli/cmd_import.go` (counts), every command that registers `--glob-db` (7 sites; `grep '"glob-db"' pkg/cli`), tests.

**1. `Repository.SaveRecordsBatchSkipExisting(ctx, records) (inserted []string, err error)`.**
- Same as `SaveRecordsBatch` (`:470-495`), but uses `tx.NewInsert().Model(&records).On("CONFLICT (uuid) DO NOTHING").Returning("uuid").Scan(ctx, &inserted)`. RETURNING works on modernc SQLite and on Postgres.
- Call `emitRecordSaved` only for the inserted UUIDs.
- `SaveRecordsBatch` is unchanged for its other callers.

**2. `ImportJSONL`** (`importer.go:350-480`).
- Flush records every 500 during parsing via `SaveRecordsBatchSkipExisting`, then once more for the remainder. Findings stay buffered.
- Add `Result.RecordsSkippedDuplicate` and `Result.FindingsFailed`.
- Line cap: add `Options.MaxLineBytes` (0 → `DefaultMaxLineBytes = 256 << 20`). Replace `ReadBytes` with a `ReadSlice('\n')` accumulation loop that fails with `fmt.Errorf("line %d exceeds %d bytes (%d records already committed)", …)`.
- `results, err := repo.SaveFindingsDirectBatch(…)`: if `err != nil`, return it. This also prevents indexing into nil results.
- `tallyFindingSaves` returns `(saved, deduped, failed)`. Errored findings count toward `FindingsFailed`, not `FindingsSkipped` (`:243-256`).
- Propagate `UpdateAgenticScan` errors (`:476`, and the same pattern at `:301, :325`).

**3. CLI import** (`cmd_import.go`).
- JSON output adds `records_skipped_duplicate` and `findings_failed`.
- The human output reports "N failed" separately from "duplicates skipped" (`:522, :537`).
- If `FindingsFailed > 0`, return `fmt.Errorf("%d findings failed to save", n)` after the summary (exit 1).

**4. Glob rollback** (`openGlobDB`, `stateless_db.go:540-576`).
- Before each source, record `maxRowID` for `http_records` (rowid), `findings` (id) and `agentic_scans` (rowid).
- Call the import through a package var `globImportPath = dbimport.ImportPath`, as a test seam.
- On `impErr`:
  - delete rows beyond the marks: `DELETE FROM finding_records WHERE finding_id > ?`, then `findings`, `http_records` and `agentic_scans`;
  - if the rollback fails, the scratch DB is inconsistent: close it and return an error;
  - otherwise append `{File, Error}` to `globDBSkippedFiles`.
- Store `globDBMatchedCount`.
- Reset the new globals in `resetDBCacheForTest`.

**5. `--glob-strict`** (bool), registered next to every `--glob-db`. On the first `impErr`, close and return `fmt.Errorf("--glob-db: %s: %w", m, impErr)`.

**6. Envelope accounting.** In `writeAgentJSON` (`agentview.go:142`), before encoding: when `v` is an `*agentEnvelope` and `strings.TrimSpace(globalGlobDB) != ""`, add `env.With("glob_sources", map{"pattern", "matched", "loaded", "skipped":[{file,error}]})`.

**Tests**
- `TestImportJSONLDuplicateUUIDIsIdempotent`: 501 lines including one duplicate → no error, 500 rows, `RecordsSkippedDuplicate == 1`. Re-importing the same bytes inserts 0 and skips 500.
- `TestImportJSONLLineCap`: `MaxLineBytes 4096` with an 8 KiB line → error.
- `TestTallyFindingSavesSeparatesFailures`.
- `TestGlobFailedSourceRollsBack`: override `globImportPath` so that for `a.jsonl` it inserts 3 records and then errors, and for `b.jsonl` it behaves normally. Assert 1 record remains, attribution is `b:1`, and `glob_sources.skipped` contains a.
- `TestGlobStrictStopsOnFirstFailure`.

**Compat**
- Overlapping or repeated JSONL imports now succeed and skip duplicates.
- Import JSON gains fields, and finding save errors now exit 1.
- Glob stays best-effort by default (C14), but each source is accounted for and a failed source is rolled back.

---

### WP8 — Configuration is explicit-or-fail (F12, F13 slice, N10, N11)

~650 lines. This can be split into WP8a (loader, helper, DB opener, scan paths, `db_clean`, `module_enable`) and WP8b (remaining call sites, unknown-key warnings, template). **Files:** `internal/config/loader.go` (+tests), `pkg/cli/internal/clicommon/config.go`, `pkg/cli/internal/clicommon/db.go`, `public/vigolium-configs.example.yaml`, call sites under `pkg/cli`.

**1. `config.LoadError{Path string; Explicit bool; Op string /*"stat","read","parse"*/; Err error}`**, with `Error`/`Unwrap`.
- `LoadSettings` (`loader.go:178-232`) returns it on every failure.
- In implicit discovery (`:188-200`), only `fs.ErrNotExist` falls through to the next candidate. Any other stat error returns `LoadError{Explicit:false}`.
- Add `LoadSettingsWithWarnings(path) (*Settings, []string, error)`; `LoadSettings` wraps it. Two kinds of warning:
  - **Unknown keys:** decode the same content a second time into a throwaway `Settings` using `yaml.NewDecoder` with `KnownFields(true)` (gopkg.in/yaml.v3, already the loader's library), and report the decoder message.
  - **Shadowed cwd file:** implicit discovery picked the home file while `./vigolium-configs.yaml` also exists. Warn: "./vigolium-configs.yaml is ignored because ~/.vigolium/vigolium-configs.yaml exists; pass --config ./vigolium-configs.yaml".

**2. `clicommon.LoadSettings(configPath string) (*config.Settings, error)`.**
- On success, print the warnings once per process via `clicommon.ConfigWarn`. The default writes to stderr; `pkg/cli` overrides it to respect `--silent`.
- A `LoadError` with `Explicit` set is returned as an error.
- An implicit `LoadError` warns `ignoring unreadable config <path>: <err>; using built-in defaults` and returns defaults.

**3. Route every `config.LoadSettings(` call in `pkg/cli` through the helper.**
- Start with `clicommon/db.go:95-99`, `scan.go:283-291` and `scan_url.go:798-806`. In the last two, delete the misleading "Config file not found" text.
- Remaining sites from the verifier list:
  - `export_bundle.go:60`, `log.go:94, :310`, `js.go:60`, `extensions_eval.go:51`, `strategy.go:50`, `storage.go:49`, `db_export.go:750`, `cmd_import.go:457`;
  - `server.go:332`, `ingest.go:345`, `agent_input.go:177`, `agent.go:79, :170`, `agent_swarm.go:346`, `agent_audit.go:370`, `agent_autopilot.go:317`, `agent_triage.go:76`;
  - `doctor.go:58` — report the error as a failed check instead of hiding it;
  - `init.go:314`, `module.go:97`, `fuzz.go:598`, `agent_olium.go:77`.
- Leave `configcmd/*` (already strict) and `stateless_db.go:413` (display only).
- Review `internal/runner/runner.go:303`, but don't change runner semantics in this WP.

**4. `resetDatabase`** (`db_clean.go:291-310`). Call `config.LoadSettings` directly and refuse on **any** error: `cannot determine which database to reset: <err>`.

**5. `module_enable.go:136`.** Use `configPath := globalConfig` (expanded) when it is set, else `config.ConfigFilePath()`. Load and save the same path.

**6. Template.**
- `scanning_strategy.whitebox` (`example.yaml:306`): verify there is no consumer, then remove it or add support.
- `dynamic-assessment.max_findings_per_module` (`:438`): there is no struct field, and the CLI default (10) differs from the documented 15. Remove the key unless a consumer is found.

**Tests**
- `TestLoadSettingsExplicitInvalidIsLoadError`: `Explicit=true`, `Op="parse"`.
- `TestLoadSettingsImplicitInvalid`: HOME=`t.TempDir()`, `Explicit=false`.
- `TestLoadSettingsWarnsUnknownKey`: a `default_stratgy` typo produces a warning naming the key.
- `TestLoadSettingsWarnsShadowedCwd`: chdir into a temp dir.
- `TestDefaultConfigTemplateHasNoUnknownKeys`: decode `public.DefaultConfigYAML` with `KnownFields(true)`.
- `TestGetDBExplicitConfigErrorDoesNotOpenDefault`: temp HOME, `clicommon.ResetDBCache()`. `GetDB("/nonexistent.yaml","")` errors, and `~/.vigolium/database-vgnm.sqlite` is not created.
- `TestResetDatabaseRefusesOnConfigError`: a decoy default DB survives.
- `TestModuleEnableWritesExplicitConfig`.

**Compat**
- Commands given a broken `--config` now fail (exit 1) instead of running on defaults. This is intended.
- A broken discovered config now produces a visible warning.
- New stderr warnings for unknown keys and for a shadowed cwd config.
- Discovery order is unchanged (C16).

---

### WP9 — SQLite path encoding (F33 slice)

~150 lines. **Files:** `pkg/database/db.go` (+test), `pkg/database/merge.go` (reuse the helper).

**1. `sqliteFileURIPath(path string) string`.**
- Apply `filepath.Abs`. On Windows, prefix `/` and use `filepath.ToSlash`.
- Return `(&url.URL{Path: p}).EscapedPath()`, which encodes `?`→`%3F`, `#`→`%23`, `%`→`%25` and spaces.
- Move the encoding currently in `merge.go:173-182` (`attachSpec`) onto this helper.

**2. Read-only DSN** (`db.go:273`). Build it as `"file:" + sqliteFileURIPath(path) + "?mode=ro&…"`.

**3. Read-write DSN** (`db.go:383`). Switch to `"file:" + sqliteFileURIPath(path) + "?…"` only when `strings.ContainsAny(path, "?#%")`. `:memory:` is unchanged. Every other DSN stays byte-identical to today, which minimizes risk.

The sidecar-reclaim race is deferred (C27).

**Tests**
- `TestSQLitePathEncodingRoundTrip`: a table over directory names `a?b`, `a#b`, `a%41b`, `a%zz`, `a b` and `é` (skip `?` on Windows). For each:
  - create the DB with `NewDB` (read-write), insert a marker scan row, and close it;
  - reopen with `SQLite.ReadOnly=true`, read the marker, and close;
  - the parent dir listing must equal `{db file}`, with no stray file.

**Compat:** only paths containing `?`, `#` or `%` are affected, and those were broken.

---

### WP10 — Filesystem export generations (F20, N20)

~350 lines. **Files:** `pkg/cli/fsexport.go` (+`fsexport_test.go`). `pkg/fsexport` (shared with `--mirror-fs`) is unchanged, except that callers now pass staging roots.

**1. Stage each tree.** In `writeFSExport` (`fsexport.go:59`), keep `trafficRoot`/`findingsRoot` as the final roots, but write into `os.MkdirTemp(filepath.Dir(root), "."+filepath.Base(root)+".staging-*")` for each.
- All writes, and `fsexport.ReadLinkedRecord(trafficRoot, …)`, use the staging traffic root.
- Cross-links keep using `trafficDirBase` (`:63`), the final name, so they stay valid after the rename.
- A `defer` removes the staging dirs unless they were published.

**2. Indexes.** Always write both `index.json` files into staging; an empty tree gets an empty array (`fsWriteIndex` already renders `[]`).

**3. `publishFSGeneration(stage, root) error`.**
- If `root` is absent: rename stage → root.
- If `root` exists, it must be a dir that is empty or contains `index.json`. Otherwise return `refusing to replace <root>: not a vigolium fs export (no index.json)` and leave it untouched.
- Then rename root → `root+".old-"+rand`, rename stage → root (on failure, rename old back), and `RemoveAll(old)`.
- Traffic publishes first, then findings. If the findings publish fails, the error says the traffic tree was already updated. Two sibling renames are not claimed to be atomic.

**4. Empty result.** When there are zero records and zero findings, publish only over roots that already exist, replacing a stale tree with an empty index. If neither root exists, create nothing and keep "Nothing to export".

**5. Stats.** Set `stats.TrafficDir`/`FindingsDir` to the final roots when published.

**Tests**
- `TestFSExportReexportRemovesStaleFiles`: 3 records, then 1 → no `0002.req`.
- `TestFSExportEmptyReplacesStaleTrees`.
- `TestFSExportFreshEmptyCreatesNothing`.
- `TestFSExportRefusesForeignDir`: a non-empty dir without `index.json` → error, dir untouched.
- `TestFSExportFailureKeepsPrevious`: make the findings pass fail by dropping the findings table after seeding. The previous trees stay intact, and no `.staging-*` remains.
- `TestFSExportNoStaleBodyInFinding`: export record A with a body; re-export with record B (empty body, same host/id) plus a linked finding. The `.md` must not contain A's body.

**Compat:** a re-export replaces whole trees (intended). An existing non-vigolium dir with a clashing name now errors instead of being mixed into.

---

### WP11 — Pinned follow-ups and remaining boolean audit (F14, F23 rest, N07)

~300 lines. **Files:** `pkg/cli/read_context.go`, `pkg/cli/agent_envelope.go`, `pkg/cli/internal/clicommon/db.go`, `pkg/cli/internal/clicommon/project.go`, `pkg/cli/presentation_mode.go`, `pkg/cli/traffic.go`/`traffic_group.go`, `pkg/cli/probe_flags.go`, tests.

**1. Accessors.**
- `clicommon.OpenedDBDriver()`: record `settings.Database.Driver` next to `openedDBPath` (`db.go:159-162`).
- `clicommon.ResolvedProjectUUID() (string, bool)`: the cached value, if the `sync.Once` fired without error.

**2. `readContextArgs`** (`read_context.go:31-61`).
- **DB:**
  - If stateless and not a glob read, use `src := globalDB` (the original JSONL/SQLite source); otherwise use `OpenedDBPath()`.
  - Emit `--db` only when the driver is `"sqlite"` or the read is stateless, as `filepath.Abs(database.ExpandPath(src))`.
- **Scope:**
  - Stateless: emit `--stateless`, plus `--project-uuid <resolved>` when `explicitProjectSelected()` (from WP5).
  - Otherwise: emit `--project-uuid <ResolvedProjectUUID()>` when available, else fall back to today's logic.
- **`--config`:** `filepath.Abs`.

**3. Envelope.**
- Add `QueryArgv []string \`json:"query_argv,omitempty"\`` to `agentEnvelope` and to `envelopeFields`.
- `WithQuery` sets both `query` and `query_argv`.
- `followUpArgv(tail...) []string` returns `["vigolium", ctx…, tail…]`, or nil when the context is not reproducible.

**4. Remaining `Changed`-as-true sites.**
- `validateTrafficGroupFlags(cmd.Flags().Changed)` (`traffic.go:234`): pass a predicate using `flagOn` instead.
- `warnInertProbeFlags` (`probe_flags.go:101`): use `flagOn`.
- `presentation_mode.go:48`: `fs.Bool("ci-output-format", …)`.
- Remove the early return at `presentation_mode.go:35-37`. Recovery only ever sets values to true. Keep `TestPresentationModeDoesNotUnsetAnAlreadyResolvedMode` green.

**Tests**
- `read_context_test.go`:
  - a relative `SetOpenedDBPath("./run.sqlite")` → absolute `--db`;
  - `globalStateless` with `globalDB="x.jsonl"` → contains `--db <abs x.jsonl>`;
  - driver `postgres` → no `--db`;
  - a resolved UUID from the active-project file → `--project-uuid`.
- `TestEnvelopeQueryArgv`: after marshaling, `query_argv` is present and matches the `query` tokens.
- `presentation_mode_test.go`:
  - `traffic --json --bad --soft-fail` → soft-fail is recovered;
  - `traffic --bad --ci-output-format --json` → both are recovered;
  - a drift test: each recovered flag's `Value.Type()` equals the root flag's.
- `TestTrafficGroupAcceptsFalseConflictFlag`: `--group-by host --raw=false` → ok.

**Compat:** `query_argv` is additive. `query` now carries absolute paths and a pinned UUID. Parse-error recovery is more complete.

---

### WP12 — Event stream lifecycle (F27, F28 slice, N09, N19)

~600 lines. **Files:** `pkg/scanevents/events.go`, `pkg/scanevents/global.go` (+tests), new `pkg/cli/scan_signals.go`, `pkg/cli/scan_events.go`, `pkg/cli/scan.go`, `pkg/cli/scan_url.go`, tests.

**1. Emitter.**
- Add `Seq uint64 \`json:"seq"\`` to `Event`, stamped under `e.mu` and starting at 1 (`events.go:228-254`).
- Keep the first write error in `e.err`, exposed via `func (e *Emitter) Err() error`. Keep the latch.
- Add the type constant `TypeScanInterrupting = "scan.interrupting"` (nonterminal) to the type list.

**2. Signal coordinator** (`scan_signals.go`). It replaces `setupScanSignalHandler` (`scan.go:2151-2176`) and the scan's use of `scanevents.TrapSignals`. Keep `TrapSignals` exported, but `pkg/cli` stops calling it.

```go
type scanSignalCoordinator struct {
    ch chan os.Signal; done chan struct{}
    mu sync.Mutex; closer interface{ Close() }
    interrupted atomic.Bool; start time.Time
}
func startScanSignals(start time.Time) *scanSignalCoordinator // signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
func (c *scanSignalCoordinator) attach(r interface{ Close() }) // stores r; if already interrupted → go r.Close()
func (c *scanSignalCoordinator) Interrupted() bool
func (c *scanSignalCoordinator) stop()                       // signal.Stop + close(done); idempotent
```

- **First signal:** set interrupted, call `scanevents.Emit(Event{Type: TypeScanInterrupting, Message: sig.String()})`, and `go closer.Close()` if a closer is attached.
- **Second signal:** call `scanevents.Finish(Event{Status: StatusInterrupted, DurationMS: …})`, then `os.Exit(1)`. The force-exit code is the same as today.
- **Lifetime:** `executeNativeScan` and `runRunnerScan` start the coordinator before `beginScanEventStream` and `defer stop()`. Store it in the package var `activeScanSignals` so `runScanWithIngest`/`runDBScan` can reach it.
- **Call sites:** replace `setupScanSignalHandler(scanRunner)` at `scan.go:825, 859, 1258, 1285` and `scan_url.go:928` with `activeScanSignals.attach(scanRunner)`.
- **Pre-run check:** before `RunNativeScan`, if `Interrupted()` is already set, skip the run (graceful no-op). Verify that `Runner.Close` before a run is safe.

**3. Terminal event after finalization.**
- `beginScanEventStream` returns `(prepare func(error), emit func(error))`.
  - `prepare` stays where `finishEvents` is deferred today (`scan.go:718`, `scan_url.go:887`) and computes the totals while the DB is open.
  - `emit` writes `scan.finished` with status `failed` if err is set, else `interrupted` if `activeScanSignals.Interrupted()`, else `completed`.
- In `executeNativeScan`, register `defer func() { emit(err) }()` before `dbIsolateBegin` (`:655`), so the terminal status reflects the merge outcome. Use a nil-safe holder, because `emit` is only assigned later.

**4. SIGPIPE under `--events`** (unix build tag).
- In `beginScanEventStream`, when events are enabled, call `signal.Notify(pipeCh, syscall.SIGPIPE)` with a draining goroutine. Stop it in `emit`.
- Writes to a closed stdout then return EPIPE: the emitter latches and `Err()` is set.
- In `emit`, if `scanevents.Default().Err() != nil`, print to stderr `event stream delivery failed: <err>; the scan ran to completion` (C9). The exit code is unaffected.

**Tests** (all with `-race`)
- `scanevents`:
  - `TestEmitterSeqMonotonic`: 32 goroutines × 100 emits into a buffer. Decoded `seq` values are unique and strictly increasing in output order.
  - `TestEmitterErrRecorded`: a writer that fails after N bytes → `Err() != nil`, and later emits are no-ops.
- `pkg/cli`:
  - `TestCoordinatorClosesAttachedRunner`: fake closer; after start, `syscall.Kill(os.Getpid(), syscall.SIGTERM)`; wait for `Close`. The buffer emitter got `scan.interrupting` and no `scan.finished`.
  - `TestCoordinatorInterruptBeforeAttach`: signal first, then attach → `Close` is called.
  - `TestEmitReportsInterruptedWithTotals`: `emit(nil)` after an interrupt → the last line is `scan.finished` with status interrupted and `records_written`.
  - `TestTerminalEventAfterMergeFailure`: a defer-order unit test with fake prepare/emit/merge closures.
  - `TestEventsSurviveClosedPipe` (unix): re-exec the test binary with an env guard. The child installs the SIGPIPE handling and emits to a pipe whose read end the parent has closed. The child exits 0 and prints the warning.
- Coordinator tests stop the coordinator in `t.Cleanup` and are never parallel.
- Command: `go test -race -short ./pkg/scanevents/... && go test -race -short -run 'TestCoordinator|TestEmitReports|TestTerminalEvent|TestEventsSurvive' ./pkg/cli/`.

**Compat**
- Events gain `seq` and the nonterminal `scan.interrupting`.
- `scan.finished` now arrives after finalization and carries the totals. Consumers that stop at the first terminal event are unaffected.
- SIGTERM now shuts native scans down gracefully, with or without `--events`. Before, it either killed the scan instantly or was ignored. A second signal forces exit 1.
- A closed event consumer no longer kills the scan.

---

### WP13 — Input consistency (F24 slice, F25)

~350 lines. **Files:** `pkg/cli/stdin.go`, `pkg/cli/flag_helpers.go`, `pkg/cli/root.go`, `pkg/cli/scan_request.go`, `pkg/cli/input_modes.go`, `pkg/input/source/file.go`, `docs/server-mode/ingestion.md`, tests.

**1. Zero disables the timeout.**
- Declare `var globalInputReadTimeout = defaultInputReadTimeout`.
- `stdinReadTimeout()` (`stdin.go:30-35`) returns `globalInputReadTimeout` as is. `ReadBounded` already treats 0 as no deadline.
- In `PersistentPreRunE`, when the command has `input-read-timeout`, the flag `Changed`, and the value is `< 0`, return `usageErrorf("--input-read-timeout must be >= 0 (0 disables the deadline)")`.
- Help text (`flag_helpers.go:29-30`): "Deadline for reading input from stdin; 0 disables it". Drop "or a file".
- Register the same flag in `registerLightweightScanIOFlags`, so scan-url and scan-request get it.

**2. Bounded request file** (`scan_request.go:66`). Use `f, err := os.Open(scanReqInput)`, then `raw, err = clicommon.ReadBounded(f, scanReqInput, clicommon.DefaultStdinLimit, 0)`.

**3. Byte preservation** (the scan-request raw branch only; scan-url and scan stdin are deferred).
- Add `normalizeRawRequestInput(raw string) string`. It always strips leading whitespace. It strips trailing whitespace only when the header block (up to the first `\r\n\r\n` or `\n\n`) has neither `Content-Length` nor `Transfer-Encoding`, matched case-insensitively.
- Format detection keeps using `strings.TrimSpace(raw)`. The raw HTTP parser receives `normalizeRawRequestInput(raw)` (`scan_request.go:72-96`). The curl branch is unchanged.

**4. Registry-derived input modes.**
- In `pkg/input/source/file.go`, export `type FormatInfo struct{ Name string; Aliases []string; TargetList bool }` and `func Formats() []FormatInfo`, built from the canonical table (`:122-134`). Remove the stale "spitolas" comment (`:53`).
- `input_modes.go` keeps only `{description, example}` keyed by canonical name; names and aliases come from `source.Formats()`.
- Build the `-I` help string from `source.Formats()` (`flag_helpers.go:25`).
- Update `docs/server-mode/ingestion.md:260`.

**Tests**
- `TestStdinReadTimeoutZeroDisables`.
- `TestInputReadTimeoutRegisteredOnLightweightCommands`.
- `TestNegativeInputReadTimeoutRejected`.
- `TestNormalizeRawRequestKeepsBodyWithContentLength`: for `"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 6\r\n\r\na=1 \r\n\n"`, the body `"a=1 \r\n\n"` is preserved. Without `Content-Length`, the trailing whitespace is trimmed.
- `TestInputModesMatchRegistry`: every registry entry has a description and vice versa, and the aliases are equal.

**Compat**
- `--input-read-timeout 0` now behaves as documented.
- scan-url and scan-request gain the flag.
- A raw request with `Content-Length` keeps its trailing body bytes.
- The mode listing now shows nuclei as canonical, with `nuclei-output` as an alias.

---

### WP14 — Bootstrap only where needed (F26 slice)

~200 lines. **Files:** `pkg/cli/root.go`, `pkg/cli/init.go`, tests.

**1. `shouldBootstrap(cmd *cobra.Command) bool`.** It returns false for:
- the root itself (`cmd == cmd.Root()`);
- the names `init`, `version`, `help`, `__complete` and `__completeNoDesc`;
- `completion` and any of its descendants.

Wrap the block at `root.go:226-249` in it.

**2. `initializeVigolium(createDefaultDB bool)`** (`init.go:41`).
- When false, skip the database block (`:84-106`).
- `ensureInitialized` passes `strings.TrimSpace(globalDB) == "" && !globalReadOnly`.
- The config, profiles and assets are still written. The default DB is then created on first real use, via `clicommon.GetDB`.

**Tests**
- `TestShouldBootstrap` table: root, version, help, completion bash, `__complete`, scan, finding.
- `TestInitializeSkipsDefaultDBWhenPinned`: HOME=`t.TempDir()`. `initializeVigolium(false)` → the config exists and `database-vgnm.sqlite` does not.

**Compat:** `version`, `help` and `completion` no longer create `~/.vigolium`. A first run with `--db` no longer creates the unused default DB.

---

### WP15 — Opt-in aggregate output budget (F31 slice)

~300 lines. **Files:** `pkg/cli/agentview.go`, new `pkg/cli/output_budget.go`, `pkg/cli/agent_error.go` (new code), tests.

**1. Flag.** Register `--max-output-bytes int` (default 0 = unlimited) in `registerAgentJSONFlags` (`agentview.go:61`), which covers finding, traffic and db ls. The value must be `>= 0` and requires `--json`; otherwise it is a usage error.

**2. Budget pass in `writeAgentJSON`.** Before encoding, apply the budget when `maxOutputBytes > 0` and `v` is an `*agentEnvelope` whose `Items` is a slice (checked via `reflect`):
- Binary-search the largest prefix `k` such that `len(encodeAgentJSON(envWithPrefix(k))) <= budget`, measuring with the real encoder and its indentation.
- Set `Items` to that prefix, and add `.With("output_budget", map{"max_bytes", "returned": k, "omitted": n-k, "next_offset": env.Offset+k})`.
- `Total` is unchanged, so `resultIsPaged` and the `-o` receipt report `complete:false`.
- If even `k == 0` exceeds the budget, return `codedErrorf(errCodeOutputTooLarge, "result metadata alone exceeds --max-output-bytes %d", budget)`. Add `errCodeOutputTooLarge = "output_too_large"`.

**Tests**
- `TestOutputBudgetTruncatesAtRecordBoundary`: 10 items of about 1 KiB with a 4 KiB budget → the document is ≤ 4096 bytes, is valid JSON, and `returned + omitted == 10`.
- `TestOutputBudgetZeroIsUnlimited`.
- `TestOutputBudgetTooSmallIsCoded`.

**Compat:** opt-in. There is no default budget until it is measured (C8).

---

### WP16 — Documentation and skill truth pass (F34, F16 docs)

~250 lines. **Files:** `docs/coding-agent.md`, `docs/guides/stateless-scan.md`, `public/skills/vigolium-scanner/SKILL.md`, `references/agent-loop.md`, `references/data.md`, stale code comments (`stateless_db.go:424, :443` "in-memory"), new test.

**1. `docs/coding-agent.md` corrections.**
- `:54-55`: add `-S`, or state that scan-url persists to the project DB.
- `:21-22`: describe JSONL coverage: URL-deduplicated records, confirmed findings only, `--no-url-dedup`, and that the archive form is `scan -S --format sqlite` or the DB file itself.
- `:116-122`: show the real envelope keys: `schema_version`, `command`, `project_uuid`, `project_scoped`, `db_path`, `total`/`offset`/`limit`, `items`, `query`, `query_argv`, `generated_at(_ms)`. Legacy keys come only with `--json-legacy-keys`.
- `:143-144`: JSONL is loaded into a file-backed scratch DB, not in-memory.
- `:69`: `errors` is omitempty; document `persisted` and `interrupted`.
- `:318`: the scan-url multi-input envelope.
- `:332`: the timeout semantics.
- `:363-374`: `query` and `query_argv`, when they are absent, and that paths are absolute.

**2. New notes in `docs/coding-agent.md`.**
- exports are now strict;
- a `-P` gate trip exits 4;
- `--events` owns stdout exclusively;
- `--keep-db-on-error`;
- `glob_sources` and `--glob-strict`;
- `--max-output-bytes`;
- an explicit project filters `-S` reads.

**3. `guides/stateless-scan.md`.** Fix `:129-132` (`-j` prints a single indented document). Add `-S` to, or reword, the examples that lack it (`:20, :26, :124, :132, :237, :249`).

**4. Skills.** Remove "full fidelity" (`SKILL.md:50`, `agent-loop.md:42`), and mirror the contract changes in `agent-loop.md`.

**5. Test `TestCodingAgentDocEnvelopeExample`** (follows the `usage_examples_parse_test.go` precedent).
- Read `docs/coding-agent.md` and extract the fenced JSON under "Query findings → Output shape".
- Assert that it parses, and that its top-level keys are a subset of the keys produced by `newAgentEnvelope(...).WithProjectScope("p").WithQuery("finding").MarshalJSON()`.

---

## Section C — Decisions on open questions

| # | Question (plan §14 / review) | Decision | Rationale |
|---|---|---|---|
| C1 | Artifact flag spelling | No `--artifact` flag now. Keep `-o`/`--format`. | Avoids a semantic alias before the receipt contract exists. |
| C2 | Default canonical format / adjacent receipt | SQLite stays the recommended archive (`-S --format sqlite`). No adjacent receipt by default. | Receipt and manifest are Phase B. |
| C3 | Partial execution exit | Partial `-P` failure keeps the legacy exit 0. Any gated child gives exit 4, unless everything failed or was interrupted (exit 1). A graceful interrupt keeps its current exit code and exposes `interrupted` in direct JSON and in events. | Phase A must not flip exit policy; only the lost gate was a bug. |
| C4 | Failed-run retention | Off by default. Opt in with `--keep-db-on-error` (requires `-S`). A db-isolate merge failure always preserves the DB, because the CLI already promised that. Location: `~/.vigolium/recovered/` (dir 0700, files 0600). No expiry; the path is printed in the error message. | Matches the plan default while honoring the existing promise. |
| C5 | Overwrite | Keep the legacy replace-on-`-o`, now atomic. fs export refuses to replace a non-vigolium dir. | Compatible and loss-free. |
| C6 | Multi-project artifact reads | Unscoped unless a project is explicitly selected, by flag or by `VIGOLIUM_PROJECT_*`. An explicit selection always filters. No automatic selection of a sole project. | An explicit choice is never ignored, and the default is unchanged. |
| C7 | JSONL fidelity | Document the coverage and add `--no-url-dedup`. Coverage profiles are deferred. | Cheap truth now; profile design later. |
| C8 | Machine output default size | Unlimited by default; `--max-output-bytes` is opt-in. | The plan requires measurement before choosing a default. |
| C9 | Progress disconnect | Under `--events`, a closed consumer does not cancel the scan. The delivery failure is reported on stderr, and the exit code is unaffected. | Artifacts are the durable outcome; events are best-effort progress. |
| C10 | Read-only PostgreSQL | Unchanged: it relies on server grants. Document that the CLI does not enforce it. | Needs a backend matrix. |
| C11 | Schema repair on reads | Unchanged. Writable opens migrate, `--read-only` never does, and `WithoutCancel` stays. | A compatibility path is needed before changing this. |
| C12 | Default lifetime | Unchanged. | Breaking-release decision. |
| C13 | Strict vs best-effort export | Strict now: any DB read error fails the export, and the previous file survives. No best-effort flag. | A silent partial artifact is a P0 integrity bug, and atomic publication makes failure safe. |
| C14 | Glob read default | Best-effort by default, with per-source accounting (`glob_sources`) and rollback of failed sources. `--glob-strict` is opt-in. | The plan's strict default is compat-sensitive (§12); the accounting removes the silence. |
| C15 | JSONL re-import duplicates | Skip on UUID conflict and count them (`records_skipped_duplicate`). | Makes JSONL import idempotent, like SQLite merges. |
| C16 | Config errors and discovery | An explicit `--config` failure is fatal. A discovered-config failure produces a stderr warning and defaults. Unknown keys and a shadowed cwd config produce warnings. Discovery order is unchanged. | Fail closed where the user was explicit, without breaking discovered setups. |
| C17 | `--input-read-timeout` zero | 0 means no deadline, as documented. Negative values are a usage error. | Aligns the code with the help text and the docs. |
| C18 | scan-url multi-input JSON | One `agentEnvelope` whose `items` are the scan results. A single input keeps the bare legacy shape. | Restores the one-document contract without breaking single-target consumers. |
| C19 | `--events` stdout conflicts | Rejected before any work starts (exit 2). | Exactly one protocol on stdout. |
| C20 | SIGTERM for native scans | Graceful, same as SIGINT. A second signal forces exit 1. | Today SIGTERM is ignored under `--events` and an instant kill otherwise. |
| C21 | Extraction read-only promise | Fix the help text instead of forcing read-only. | Forcing it would break older-schema artifacts that currently work. |
| C22 | `VIGOLIUM_DB_PATH` auto-unscoped vs `--db` scoped | Kept as is and documented. An explicit project overrides both (C6). | Changing the default scope is listed as compat-sensitive in §12. |
| C23 | `vigolium export` default scope | Whole DB unless a project is explicit. The `{project-uuid}` placeholder is unchanged; its mismatch when unscoped is noted for a later release. | Compatibility. |
| C24 | Accepted no-op `-S` | Stderr warning now; rejection in a later breaking release. | Phases in the plan's rule to reject in the new contract. |
| C25 | Atomic output permissions | `atomicfile.Write` stays 0600. `WriteBytes` creates 0644 masked by the umask. `export -o` and `db export -o` keep 0666 masked by the umask, identical to the old `os.Create`. | No permission regressions; a privacy policy is deferred. |
| C26 | Bundle without `report.html` | Publication fails. | It is a required member. |
| C27 | SQLite sidecar reclaim race | Deferred. Don't take fcntl locks in-process: closing any fd on the file drops SQLite's own POSIX locks. | Needs a dedicated design. |
| C28 | `--upload-results` failure | Fails with `export_failed` (exit 1). | It is a requested output. |
| C29 | Post-scan JSONL/fs scope (project vs scan) | Unchanged. | A per-run closure needs defined record-reuse semantics, because records persist across scans. |
| C30 | Color forcing and `IS_SANDBOX` | Unchanged. | Deliberate policy pinned by tests. |
