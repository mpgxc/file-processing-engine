import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { PdfEngine } from './pdf/pdf.engine';
import { CsvEngine } from './csv/csv.engine';
import { XlsxEngine } from './xlsx/xlsx.engine';
import { TxtEngine } from './txt/txt.engine';
import { EngineRegistry } from './core/engine.registry';

@Injectable()
class EngineRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: EngineRegistry,
    private readonly pdfEngine: PdfEngine,
    private readonly csvEngine: CsvEngine,
    private readonly xlsxEngine: XlsxEngine,
    private readonly txtEngine: TxtEngine,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.pdfEngine);
    this.registry.register(this.csvEngine);
    this.registry.register(this.xlsxEngine);
    this.registry.register(this.txtEngine);
  }
}

@Module({
  providers: [
    PdfEngine,
    CsvEngine,
    XlsxEngine,
    TxtEngine,
    EngineRegistry,
    EngineRegistrar,
  ],
  exports: [EngineRegistry],
})
export class EnginesModule {}
