# Personal gifts release September 23 2026

User authorized commit, push, and deployment after local review. This release is based on live commit d2f77d8 and adds only personally received gifts. Earlier planning and interested-submission changes remain on their separate test branch. Canonical technical guides include both histories; their local-only statements record the pre-authorization review stage.

CSM source commit 24f3eec. Apply CSM DB migration 0005 only, after recording its recovery bookmark. No HS production migration is required. Deploy HS production receiver and contact authority before CSM production. Existing live-to-live private bindings are retained. Test DB and bucket are untouched; no live records are copied or synchronized by this release. Validate unauthenticated data protection and published assets without adding fictitious gifts to production.
