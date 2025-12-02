import { BadRequestException, Injectable } from '@nestjs/common';
import * as xlsx from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { timezoneHelper } from '../../common/helpers';

@Injectable()
export class TypologyService {
  constructor(private readonly prisma: PrismaService) {}

  async findByMapId(id: number) {
    return await this.prisma.typology.findMany({
      where: { deleted_at: null, map_id: id },
    });
  }

  async getIdsByMapId(id: number) {
    const typologies = await this.prisma.typology.findMany({
      select: { incidence_id: true },
      where: { deleted_at: null, map_id: id },
    });
    if (typologies.length === 0)
      throw new BadRequestException('No existen tipologías para este ID');
    return typologies.map((t) => t.incidence_id);
  }

  async upload(file: Express.Multer.File) {
    const typologies = await this.prisma.typology.findMany();
    if (typologies.length !== 0)
      throw new BadRequestException('Solo se puede realizar una vez');
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const data = rows.map((row: any) => {
      return {
        name: row.name,
        map_id: Number(row.map_id),
        incidence_id: Number(row.incidence_id),
        case_type: row.case_type,
        case_subtype: row.case_subtype,
        created_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      };
    });
    await this.prisma.typology.createMany({ data });
    return { success: true };
  }
}
