import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseInterceptors,
    UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Controller('properties')
export class PropertyController {
    constructor(private readonly propertyService: PropertyService) {}

    @Post()
    create(@Body() createPropertyDto: CreatePropertyDto) {
        return this.propertyService.create(createPropertyDto);
    }

    @Get()
    findAll() {
        return this.propertyService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: number) {
        return this.propertyService.findOne(id);
    }

    @Get('owner/:ownerId')
    findByOwner(@Param('ownerId') ownerId: number) {
        return this.propertyService.findByOwner(ownerId);
    }

    @Patch(':id')
    update(@Param('id') id: number, @Body() updatePropertyDto: UpdatePropertyDto) {
        return this.propertyService.update(id, updatePropertyDto);
    }

    @Patch(':id/publish')
    publish(@Param('id') id: number) {
        return this.propertyService.publish(id);
    }

    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.propertyService.remove(id);
    }

    // --- File endpoints ---

    @Post(':id/files')
    @UseInterceptors(
        FilesInterceptor('files', 10, {
            storage: diskStorage({
                destination: './uploads',
                filename: (_req, file, cb) => {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                    const ext = extname(file.originalname);
                    cb(null, `${uniqueSuffix}${ext}`);
                },
            }),
            fileFilter: (_req, file, cb) => {
                const allowedMimes = [
                    'image/jpeg',
                    'image/png',
                    'image/webp',
                    'video/mp4',
                ];
                if (allowedMimes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new BadRequestException(`File type ${file.mimetype} is not allowed. Allowed: jpg, png, webp, mp4`), false);
                }
            },
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB
            },
        }),
    )
    uploadFiles(
        @Param('id') id: number,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        return this.propertyService.saveFiles(id, files);
    }

    @Get(':id/files')
    getFiles(@Param('id') id: number) {
        return this.propertyService.getFiles(id);
    }

    @Delete(':id/files/:fileId')
    removeFile(@Param('id') id: number, @Param('fileId') fileId: number) {
        return this.propertyService.removeFile(id, fileId);
    }
}
