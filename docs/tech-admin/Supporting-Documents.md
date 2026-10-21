# Supporting Documents

Implemented October 20, 2026. Local implementation; deployment is a separate step.

Open **Supporting Documents** in the MMT left menu, or open Documents and choose Supporting Documents. The route is `/admin/ministry/#documents/supporting`.

The four folders are Brochures, Journey Documents, Envelope Templates, and Other Resources. These are logical folders in the existing private document library, stored as categories prefixed with `Supporting Documents / `. No database migration or new public file directory is required. Existing documents and their categories remain available under All documents.

Choose a folder, then Upload document. Enter a title, choose the folder and optional related journey, select the file, and save. PDF, DOCX, XLSX, PPTX, PNG, and JPEG are supported, up to 10 MB per file. Choosing a folder preselects it in the upload form. Search matches titles, folders, and current or historical filenames. Journey filtering includes an Organization resources option for files without a journey association.

Downloads remain authenticated and private. Existing Documents permissions control access; edit permission is required for upload, replacement, Trash, and restore. Read-only users can search and download. Volunteer-only users do not gain Documents access. Replace retains earlier versions, Move to trash hides a file from the normal view, and Show Trash exposes recoverable records. This extends the existing environment-specific D1/R2 storage and does not copy files between environments.

The list API now supplies `journeys` (IDs and titles) and `canManage` so document users do not need access to the full journey-management bootstrap to organize files.

No brochure or envelope template was automatically uploaded. The existing envelope template was not found in the checked project paths or document search; its file/location is still needed.

Validation: Worker type check; ministry management and supporting document integration suites; `node tools/check-supporting-documents.cjs` for folder selection, upload defaults, search, journey filtering, and mobile width.
