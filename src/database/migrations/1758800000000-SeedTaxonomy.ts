import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Categories, processes and states as data, not code.
 *
 * A new category or process must be an inserted row, never a code change and
 * a redeploy — that is the whole reason `taxonomy` is one table with a `type`
 * column rather than several tables.
 *
 * `search_terms` exist so a category can be matched from the words users
 * actually type, which are rarely the words on the label.
 */
export class SeedTaxonomy1758800000000 implements MigrationInterface {
  name = 'SeedTaxonomy1758800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO taxonomy (type, key, name, description, search_terms, config, display_order)
      VALUES
        ('category', 'immigration', 'Residency and visas',
         'Steps, documents, fees and timelines',
         ARRAY['residency','visa','inm','permanent','temporary','curp'],
         '{"sampleQuestion":"What do I need for permanent residency?"}', 1),

        ('category', 'tax', 'Taxes, RFC and SAT',
         'Registration and basic tax guidance',
         ARRAY['rfc','sat','tax','efirma','e.firma','invoice','factura'],
         '{"sampleQuestion":"How do I get a tax ID in Mexico?"}', 2),

        ('category', 'healthcare', 'Healthcare',
         'Doctors, IMSS and pharmacies',
         ARRAY['imss','doctor','hospital','pharmacy','medicine','seguro'],
         '{"sampleQuestion":"How do I register with IMSS?"}', 3),

        ('category', 'daily_living', 'Daily living',
         'Banking, utilities, renting and driving',
         ARRAY['bank','cfe','utility','rent','driving','licence','license'],
         '{"sampleQuestion":"Can I drive on my US licence?"}', 4)
      ON CONFLICT (type, key) DO NOTHING
    `);

    // Government processes. Module 6 renders these with a fixed structure, so
    // adding one is a row here rather than a new screen.
    await queryRunner.query(`
      INSERT INTO taxonomy (type, key, name, description, search_terms, config, display_order)
      VALUES
        ('process', 'permanent_residency', 'Permanent residency',
         'Lets you live in Mexico indefinitely, with no renewals',
         ARRAY['permanent','residency','residencia permanente'],
         '{"category":"immigration","requiredContext":["state"],"prerequisites":["CURP","Temporary residency held for four years"]}', 1),

        ('process', 'temporary_residency', 'Temporary residency',
         'One to four years, renewable',
         ARRAY['temporary','residency','residencia temporal'],
         '{"category":"immigration","requiredContext":["state"]}', 2),

        ('process', 'rfc_registration', 'RFC registration',
         'The Mexican tax ID, needed for banking and leases',
         ARRAY['rfc','tax id','registro federal'],
         '{"category":"tax","requiredContext":["state"],"prerequisites":["CURP"]}', 3),

        ('process', 'curp', 'CURP',
         'The population ID number, a prerequisite for most processes',
         ARRAY['curp','clave unica'],
         '{"category":"immigration","requiredContext":["state"]}', 4),

        ('process', 'imss_registration', 'IMSS health cover',
         'Enrolling in public health insurance',
         ARRAY['imss','health','seguro social'],
         '{"category":"healthcare","requiredContext":["state"]}', 5)
      ON CONFLICT (type, key) DO NOTHING
    `);

    // States a document can be scoped to, and a user can live in. Data rather
    // than a hardcoded list in two different files.
    await queryRunner.query(`
      INSERT INTO taxonomy (type, key, name, search_terms, config, display_order)
      VALUES
        ('state', 'Yucatan', 'Yucatán', ARRAY['merida','yucatan'], '{}', 1),
        ('state', 'Quintana Roo', 'Quintana Roo', ARRAY['cancun','playa del carmen','tulum'], '{}', 2),
        ('state', 'CDMX', 'Mexico City', ARRAY['cdmx','mexico city','df'], '{}', 3),
        ('state', 'Jalisco', 'Jalisco', ARRAY['guadalajara','puerto vallarta'], '{}', 4),
        ('state', 'Nuevo Leon', 'Nuevo León', ARRAY['monterrey'], '{}', 5),
        ('state', 'Baja California', 'Baja California', ARRAY['tijuana','ensenada'], '{}', 6),
        ('state', 'Oaxaca', 'Oaxaca', ARRAY['oaxaca'], '{}', 7),
        ('state', 'Guanajuato', 'Guanajuato', ARRAY['san miguel de allende','leon'], '{}', 8)
      ON CONFLICT (type, key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM taxonomy`);
  }
}
