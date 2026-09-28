import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TaxonomyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Categories, with a live count of how many documents each one actually has.
   *
   * The count is what lets the interface avoid offering a topic the library
   * cannot answer — see `suggestions()`.
   */
  async categories() {
    return this.dataSource.query(`
      SELECT t.key,
             t.name,
             t.description,
             t.config->>'sampleQuestion'                        AS "sampleQuestion",
             COUNT(d.id) FILTER (WHERE d.status = 'ready')::int  AS "documentCount"
        FROM taxonomy t
        LEFT JOIN documents d
               ON d.category_id = t.key AND d.deleted_at IS NULL
       WHERE t.type = 'category' AND t.is_active
       GROUP BY t.id
       ORDER BY t.display_order
    `);
  }

  async processes() {
    return this.dataSource.query(`
      SELECT key, name, description,
             config->>'category'      AS category,
             config->'prerequisites'  AS prerequisites
        FROM taxonomy
       WHERE type = 'process' AND is_active
       ORDER BY display_order
    `);
  }

  async states() {
    return this.dataSource.query(`
      SELECT key, name FROM taxonomy
       WHERE type = 'state' AND is_active
       ORDER BY display_order
    `);
  }

  /**
   * Home-screen suggestions, drawn only from categories that have live
   * documents.
   *
   * If a new user clicks the first suggested question and is told we do not
   * know, they do not come back. A hardcoded list guarantees that happens on
   * day one, when the library is nearly empty — which is exactly when first
   * impressions are formed.
   */
  async suggestions() {
    const categories = await this.categories();
    const stocked = categories.filter(
      (c: { documentCount: number }) => c.documentCount > 0,
    );

    // Nothing uploaded yet: say so plainly rather than offering questions
    // that will all fail.
    if (stocked.length === 0) {
      return { topics: [], questions: [], libraryEmpty: true };
    }

    return {
      topics: stocked.map((c: Record<string, unknown>) => ({
        key: c.key,
        title: c.name,
        description: c.description,
        question: c.sampleQuestion,
      })),
      questions: stocked
        .map((c: { sampleQuestion: string }) => c.sampleQuestion)
        .filter(Boolean),
      libraryEmpty: false,
    };
  }
}
