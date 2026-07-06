import Database from "better-sqlite3";

export class OutputCache {
  constructor(private db: Database.Database) {}

  get(assetId: string, width: number, height: number, bg: string, format: string): string | null {
    const row = this.db
      .prepare(
        `SELECT file_path FROM generated_outputs
         WHERE source_asset_id = @assetId AND requested_width = @width
           AND requested_height = @height AND background = @bg AND output_format = @format`
      )
      .get({ assetId, width, height, bg, format }) as { file_path: string } | undefined;
    return row?.file_path || null;
  }

  set(assetId: string, width: number, height: number, bg: string, format: string, filePath: string): void {
    this.db
      .prepare(
        `INSERT INTO generated_outputs (source_asset_id, requested_width, requested_height, background, output_format, file_path)
         VALUES (@assetId, @width, @height, @bg, @format, @filePath)
         ON CONFLICT(source_asset_id, requested_width, requested_height, background, output_format)
         DO UPDATE SET file_path = @filePath`
      )
      .run({ assetId, width, height, bg, format, filePath });
  }
}
