import { createFileRoute } from "@tanstack/react-router";

const allowedFiles = new Set([
  "README-Windows-download.txt",
  "UmarMedicineERP-Windows.zip",
  "UmarMedicineERP-Windows-Fixed-Part-01.zip",
  "UmarMedicineERP-Windows-Fixed-Part-02.zip",
  "UmarMedicineERP-Windows-Fixed-Part-03.zip",
  "UmarMedicineERP-Windows-Fixed-Part-04.zip",
  "UmarMedicineERP-Windows-Fixed-Part-05.zip",
  "UmarMedicineERP-Windows-Fixed-Part-06.zip",
  "UmarMedicineERP-Windows-Fixed-Part-07.zip",
  "UmarMedicineERP-Windows-Fixed-Part-08.zip",
  "UmarMedicineERP-Windows-Part-01.zip",
  "UmarMedicineERP-Windows-Part-02.zip",
  "UmarMedicineERP-Windows-Part-03.zip",
  "UmarMedicineERP-Windows-Part-04.zip",
  "UmarMedicineERP-Windows-Part-05.zip",
  "UmarMedicineERP-Windows-Part-06.zip",
  "UmarMedicineERP-Windows-Part-07.zip",
  "UmarMedicineERP-Windows-Part-08.zip",
]);

export const Route = createFileRoute("/api/public/windows-download/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const file = params.file;

        if (!allowedFiles.has(file)) {
          return new Response("File not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("desktop-downloads-private")
          .download(file);

        if (error || !data) {
          return new Response("File not available", { status: 404 });
        }

        const contentType = file.endsWith(".zip")
          ? "application/zip"
          : "text/plain; charset=utf-8";

        return new Response(data, {
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${file}"`,
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});