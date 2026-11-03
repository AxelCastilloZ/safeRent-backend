import { SelectQueryBuilder } from 'typeorm';
import { FindPropertiesDto } from './dto/find-properties.dto';

/**
 * Filtros del entorno del explorador. Se calculan con el promedio de las encuestas que los inquilinos
 * responden al terminar su estadía: una propiedad sin encuestas no cumple ningún filtro del entorno.
 */
export function applyStaySurveyFilters<T extends object>(query: SelectQueryBuilder<T>, dto: FindPropertiesDto) {
  const having: string[] = [];
  const params: Record<string, number | boolean> = {};

  if (dto.minWaterStability !== undefined) {
    having.push('AVG(survey."waterStability") >= :surveyMinWater');
    params.surveyMinWater = dto.minWaterStability;
  }
  if (dto.minElectricityStability !== undefined) {
    having.push('AVG(survey."electricityStability") >= :surveyMinElectricity');
    params.surveyMinElectricity = dto.minElectricityStability;
  }
  if (dto.minInternetMbps !== undefined) {
    having.push('AVG(survey."internetMbps") >= :surveyMinInternet');
    params.surveyMinInternet = dto.minInternetMbps;
  }
  if (dto.maxUniversityKm !== undefined) {
    having.push('AVG(survey."universityKm") <= :surveyMaxUniversity');
    params.surveyMaxUniversity = dto.maxUniversityKm;
  }
  if (dto.maxCoworkingKm !== undefined) {
    having.push('AVG(survey."coworkingKm") <= :surveyMaxCoworking');
    params.surveyMaxCoworking = dto.maxCoworkingKm;
  }
  if (dto.hasWorkArea === true) {
    // Mayoría de los inquilinos dijo que sí tiene área de trabajo.
    having.push('SUM(CASE WHEN survey."hasWorkArea" THEN 1 ELSE 0 END) * 2 > COUNT(*)');
  }
  if (!having.length) return;

  query.andWhere(
    `property.id IN (SELECT survey."propertyId" FROM "stay_survey" survey GROUP BY survey."propertyId" HAVING ${having.join(' AND ')})`,
    params,
  );
}
