/**
 * 大注释：World weather module.
 * Searches, refreshes, caches, and formats weather context for each world.
 */
import type { WorldProfile, WorldWeatherLocation, WorldWeatherSnapshot } from '../core/types';
import { isRecord } from '../core/utils';

const WEATHER_CACHE_MS = 10 * 60 * 1000;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function weatherLocationLabel(location?: WorldWeatherLocation): string {
  if (!location) return '未设置城市';
  return [
    location.name,
    location.admin1 && location.admin1 !== location.name ? location.admin1 : '',
    location.country,
  ].filter(Boolean).join('，');
}

export function weatherCodeText(code?: number): string {
  switch (code) {
    case 0: return '晴';
    case 1: return '大致晴朗';
    case 2: return '局部多云';
    case 3: return '阴';
    case 45:
    case 48: return '雾';
    case 51:
    case 53:
    case 55: return '毛毛雨';
    case 56:
    case 57: return '冻毛毛雨';
    case 61:
    case 63:
    case 65: return '雨';
    case 66:
    case 67: return '冻雨';
    case 71:
    case 73:
    case 75: return '雪';
    case 77: return '米雪';
    case 80:
    case 81:
    case 82: return '阵雨';
    case 85:
    case 86: return '阵雪';
    case 95: return '雷暴';
    case 96:
    case 99: return '雷暴伴冰雹';
    default: return '天气未知';
  }
}

export function weatherSnapshotLine(snapshot?: WorldWeatherSnapshot): string {
  if (!snapshot) return '当前天气：未获取。';
  return [
    `当前天气：${snapshot.weatherText}`,
    `气温 ${Math.round(snapshot.temperatureC)}°C`,
    typeof snapshot.apparentTemperatureC === 'number'
      ? `体感 ${Math.round(snapshot.apparentTemperatureC)}°C`
      : '',
    typeof snapshot.relativeHumidity === 'number'
      ? `湿度 ${Math.round(snapshot.relativeHumidity)}%`
      : '',
    typeof snapshot.windSpeedKmh === 'number'
      ? `风速 ${Math.round(snapshot.windSpeedKmh)} km/h`
      : '',
  ].filter(Boolean).join('，') + '。';
}

export function worldWeatherPromptContext(world?: WorldProfile): string {
  if (!world) return '';
  const location = weatherLocationLabel(world.location);
  const weatherLine = world.weather ? weatherSnapshotLine(world.weather) : '当前天气：未获取或获取失败。';
  return [
    '现实环境参考：',
    `当前世界城市：${location}。`,
    weatherLine,
    '天气和温度只用于理解角色此刻手机里的现实氛围；如果用户没提天气，不要每轮都主动播报天气。',
  ].join('\n');
}

export function shouldRefreshWorldWeather(world: WorldProfile, now = Date.now()): boolean {
  if (!world.location) return false;
  if (!world.weather) return true;
  return now - world.weather.fetchedAt > WEATHER_CACHE_MS;
}

export async function searchWeatherLocations(query: string): Promise<WorldWeatherLocation[]> {
  const name = query.trim();
  if (name.length < 2) throw new Error('城市名至少输入两个字。');
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=zh&format=json`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`城市搜索失败：${response.status} ${text.slice(0, 120)}`);
  }
  const json = await response.json().catch(() => undefined);
  const results = isRecord(json) && Array.isArray(json.results) ? json.results : [];
  return results
    .filter(isRecord)
    .map((result): WorldWeatherLocation | undefined => {
      const latitude = finiteNumber(result.latitude);
      const longitude = finiteNumber(result.longitude);
      if (latitude === undefined || longitude === undefined) return undefined;
      return {
        name: typeof result.name === 'string' ? result.name : '未命名城市',
        country: typeof result.country === 'string' ? result.country : '',
        admin1: typeof result.admin1 === 'string' ? result.admin1 : undefined,
        latitude,
        longitude,
        timezone: typeof result.timezone === 'string' ? result.timezone : undefined,
      };
    })
    .filter((location): location is WorldWeatherLocation => Boolean(location));
}

export async function fetchWeatherForLocation(location: WorldWeatherLocation): Promise<WorldWeatherSnapshot> {
  const current = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'weather_code',
    'wind_speed_10m',
    'is_day',
  ].join(',');
  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${encodeURIComponent(String(location.latitude))}`,
    `&longitude=${encodeURIComponent(String(location.longitude))}`,
    `&current=${encodeURIComponent(current)}`,
    '&timezone=auto',
    '&forecast_days=1',
  ].join('');
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`天气获取失败：${response.status} ${text.slice(0, 120)}`);
  }
  const json = await response.json().catch(() => undefined);
  const currentWeather = isRecord(json) && isRecord(json.current) ? json.current : {};
  const temperatureC = finiteNumber(currentWeather.temperature_2m);
  if (temperatureC === undefined) throw new Error('天气接口没有返回当前温度。');
  const weatherCode = finiteNumber(currentWeather.weather_code);
  return {
    temperatureC,
    apparentTemperatureC: finiteNumber(currentWeather.apparent_temperature),
    relativeHumidity: finiteNumber(currentWeather.relative_humidity_2m),
    windSpeedKmh: finiteNumber(currentWeather.wind_speed_10m),
    weatherCode,
    weatherText: weatherCodeText(weatherCode),
    isDay: typeof currentWeather.is_day === 'number' ? currentWeather.is_day === 1 : undefined,
    observedAt: typeof currentWeather.time === 'string' ? currentWeather.time : new Date().toISOString(),
    fetchedAt: Date.now(),
    source: 'open-meteo',
  };
}

export async function refreshWorldWeather(world: WorldProfile, force = false): Promise<WorldWeatherSnapshot | undefined> {
  if (!world.location) return undefined;
  if (!force && !shouldRefreshWorldWeather(world)) return world.weather;
  const snapshot = await fetchWeatherForLocation(world.location);
  world.weather = snapshot;
  world.updatedAt = Date.now();
  return snapshot;
}
