import { isTauri } from "@tauri-apps/api/core";

export interface PdfSource {
  fileName: string;
  path?: string;
  file?: File;
}

export async function pickPdfSource(): Promise<PdfSource | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "PDF Document",
          extensions: ["pdf"],
        },
      ],
    });

    if (!selected || Array.isArray(selected)) {
      return null;
    }

    const normalized = selected.replace(/\\/g, "/");
    const fileName =
      normalized.split("/").pop() || "Untitled.pdf";

    return {
      fileName,
      path: selected,
    };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";

    input.onchange = () => {
      const file = input.files?.[0];

      if (!file) {
        resolve(null);
        return;
      }

      resolve({
        fileName: file.name,
        file,
      });
    };

    input.click();
  });
}

export async function readPdfSource(
  source: PdfSource
): Promise<Uint8Array> {
  if (source.file) {
    return new Uint8Array(
      await source.file.arrayBuffer()
    );
  }

  if (!source.path) {
    throw new Error("No PDF file was supplied.");
  }

  const { readFile } = await import(
    "@tauri-apps/plugin-fs"
  );

  return await readFile(source.path);
}
