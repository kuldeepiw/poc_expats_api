import { Controller, Get } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';

@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get('categories')
  categories() {
    return this.taxonomy.categories();
  }

  @Get('processes')
  processes() {
    return this.taxonomy.processes();
  }

  @Get('states')
  states() {
    return this.taxonomy.states();
  }

  /** Only topics the library can actually answer. */
  @Get('suggestions')
  suggestions() {
    return this.taxonomy.suggestions();
  }
}
