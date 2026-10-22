import { AccessTo } from '../auth/guard/resource-access.guard';
import type { AuthRequest } from '../auth/access';
import { AppRole, Public, Roles } from '../auth/access';
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    Req,
    UseInterceptors,
    UploadedFiles,
    BadRequestException,
    ParseIntPipe,
    Optional,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { FindPropertiesDto } from './dto/find-properties.dto';
import { FindPropertiesAdminDto } from './dto/find-properties-admin.dto';
import { ReviewPropertyDto } from './dto/review-property.dto';
import { SearchLocationDto } from './dto/search-location.dto';
import { LocationService } from './location.service';
import { PropertyPricingService } from './property-pricing.service';
import { requestLanguage } from '../common/language';

@Controller('properties')
export class PropertyController {
    constructor(private readonly propertyService: PropertyService, private readonly locationService: LocationService,
        @Optional() private readonly pricing?: PropertyPricingService) {}

    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @Get('locations/search')
    searchLocations(@Query() query: SearchLocationDto, @Req() req?: AuthRequest) {
        return req?.headers['accept-language'] ? this.locationService.search(query.text, requestLanguage(req.headers['accept-language'])) : this.locationService.search(query.text);
    }

    @Roles(AppRole.CLIENT, AppRole.OWNER)
    @Post()
    create(@Req() req: AuthRequest, @Body() createPropertyDto: CreatePropertyDto) {
        createPropertyDto.ownerId = req.user.id;
        return this.propertyService.create(createPropertyDto);
    }

    @Public()
    @Get()
    async findAll(@Query() query: FindPropertiesDto) {
        return this.pricedList(query, false);
    }

    private async pricedList(query: FindPropertiesDto, active: boolean) {
        if (!this.pricing) return active ? this.propertyService.findActive(query) : this.propertyService.findAll(query);
        const context = await this.pricing.prepare(query);
        const result = active ? await this.propertyService.findActive(query, context) : await this.propertyService.findAll(query, context);
        return { ...result, data: await this.pricing.decorate(result.data, context), priceContext: this.pricing.summary(context) };
    }

    private async priced<T extends { cost: number | string; typeOfCoin: string }>(items: T[], query: FindPropertiesDto) {
        if (!this.pricing) return items;
        return this.pricing.decorate(items, await this.pricing.prepare(query));
    }

    // IMPORTANTE: rutas específicas antes de :id
    @Roles(AppRole.CLIENT)
    @Get('me/reserved')
    async findMyReserved(@Req() req: AuthRequest, @Query() query: FindPropertiesDto) {
        return this.priced(await this.propertyService.findByTenant(req.user.id), query);
    }

    @Public()
    @Get('types')
    findAllTypes() {
        return this.propertyService.findAllTypes();
    }

    @Public()
    @Get('active')
    async findActive(@Query() query: FindPropertiesDto) {
        return this.pricedList(query, true);
    }

    @Public()
    @Get('active/:id')
    async findPublic(@Param('id', ParseIntPipe) id: number, @Query() query: FindPropertiesDto) {
        return (await this.priced([await this.propertyService.findPublic(id)], query))[0];
    }

    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @AccessTo('owner-list')
    @Get('owner/:ownerId')
    async findByOwner(@Param('ownerId') ownerId: number, @Query() query: FindPropertiesDto) {
        return this.priced(await this.propertyService.findByOwner(ownerId), query);
    }

    // Solo administradores: todas las propiedades (cualquier estado) con su propietario.
    @Roles(AppRole.ADMIN)
    @Get('admin/all')
    findAllForAdmin(@Query() query: FindPropertiesAdminDto) {
        return this.propertyService.findAllForAdmin(query);
    }

    // :id después de las rutas específicas
    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @AccessTo('property')
    @Get(':id')
    async findOne(@Param('id') id: number, @Query() query: FindPropertiesDto) {
        return (await this.priced([await this.propertyService.findOne(id)], query))[0];
    }

    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @AccessTo('property')
    @Patch(':id')
    update(
        @Param('id') id: number,
        @Body() updatePropertyDto: UpdatePropertyDto,
    ) {
        return this.propertyService.update(id, updatePropertyDto);
    }

    @Roles(AppRole.CLIENT, AppRole.OWNER)
    @AccessTo('property')
    @Patch(':id/publish')
    publish(@Param('id') id: number) {
        return this.propertyService.publish(id);
    }

    // Solo administradores: aprueba, pide cambios o rechaza una propiedad en revisión.
    @Roles(AppRole.ADMIN)
    @Patch(':id/review')
    review(@Param('id', ParseIntPipe) id: number, @Body() reviewPropertyDto: ReviewPropertyDto) {
        return this.propertyService.review(id, reviewPropertyDto);
    }

    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @AccessTo('property')
    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.propertyService.remove(id);
    }

    // --- File endpoints ---

    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @AccessTo('property')
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
                    cb(new BadRequestException({ code: "API_FILE_TYPE_IS_NOT_ALLOWED_ALLOWED_JPG_PNG_WEBP", message: `File type ${file.mimetype} is not allowed. Allowed: jpg, png, webp, mp4`, params: { v0: file.mimetype } }), false);
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

    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @AccessTo('property')
    @Get(':id/files')
    getFiles(@Param('id') id: number) {
        return this.propertyService.getFiles(id);
    }

    @Roles(AppRole.CLIENT, AppRole.OWNER, AppRole.ADMIN)
    @AccessTo('property')
    @Delete(':id/files/:fileId')
    removeFile(@Param('id') id: number, @Param('fileId') fileId: number) {
        return this.propertyService.removeFile(id, fileId);
    }
}
