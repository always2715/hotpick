# STELLATE v8.0.53

## Fixed
- Resolved `[trend_refresh_failed] hybridPublication is not defined`.
- The start phase no longer references the finalize-only hybrid publication result.
- Initial counters are saved as zero with `publicationMode: pending`.
- Finalization still calculates fresh and previous-TOP carryover counts exactly as in v8.0.52.

## Operational recovery
The failed run normally stopped before candidate collection. Deploy v8.0.53 and start a new TOP refresh. Existing published TOP and cumulative feed remain unchanged.
