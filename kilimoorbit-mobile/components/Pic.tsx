/**
 * Picture icons: small bundled images (assets/icons, Microsoft's Fluent 3D
 * emoji, MIT) for the section badges, the quick actions and the Listen pill,
 * and the Meteocons weather set (assets/weather, MIT) for the forecast. Both
 * are real renders rather than view-drawn shapes, crisp at any size and the
 * same on every phone. Decorative: the label next to a picture carries the
 * meaning, so every picture is hidden from assistive tech.
 * Credits and licences: assets/CREDITS.md.
 */
import React from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { wxPicName, type WxPicName } from "../lib/sky";

export { wxPicName, type WxPicName };

export const PICS = {
  weather: require("../assets/icons/weather.png"),
  farm: require("../assets/icons/farm.png"),
  market: require("../assets/icons/market.png"),
  money: require("../assets/icons/money.png"),
  doctor: require("../assets/icons/doctor.png"),
  alerts: require("../assets/icons/alerts.png"),
  news: require("../assets/icons/news.png"),
  season: require("../assets/icons/season.png"),
  shows: require("../assets/icons/shows.png"),
  store: require("../assets/icons/store.png"),
  quiz: require("../assets/icons/quiz.png"),
  herd: require("../assets/icons/herd.png"),
  listen: require("../assets/icons/listen.png"),
  robot: require("../assets/icons/robot.png"),
  chat: require("../assets/icons/chat.png"),
  lens: require("../assets/icons/lens.png"),
  record: require("../assets/icons/record.png"),
  milk: require("../assets/icons/milk.png"),
  egg: require("../assets/icons/egg.png"),
  chicken: require("../assets/icons/chicken.png"),
  harvest: require("../assets/icons/harvest.png"),
  tractor: require("../assets/icons/tractor.png"),
  bell: require("../assets/icons/bell.png"),
  calendar: require("../assets/icons/calendar.png"),
  sparkles: require("../assets/icons/sparkles.png"),
  drop: require("../assets/icons/drop.png"),
  thermo: require("../assets/icons/thermo.png"),
  wind: require("../assets/icons/wind.png"),
  soko: require("../assets/icons/soko.png"),
  maize: require("../assets/icons/maize.png"),
  mail: require("../assets/icons/mail.png"),
  goat: require("../assets/icons/goat.png"),
  pig: require("../assets/icons/pig.png"),
  sheep: require("../assets/icons/sheep.png"),
  potato: require("../assets/icons/potato.png"),
  tomato: require("../assets/icons/tomato.png"),
  greens: require("../assets/icons/greens.png"),
  wisdom: require("../assets/icons/wisdom.png"),
  sun: require("../assets/icons/sun.png"),
  rain: require("../assets/icons/rain.png"),
} as const;
export type PicName = keyof typeof PICS;

const hidden = { accessible: false, importantForAccessibility: "no-hide-descendants" as const, "aria-hidden": true };

export default function Pic({ name, size = 24, style }: { name: PicName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={PICS[name]} resizeMode="contain" style={[{ width: size, height: size }, style]} {...hidden} />;
}

/* ── the forecast pictograms (Meteocons) ── */
const WX: Record<WxPicName, number> = {
  "clear-day": require("../assets/weather/clear-day.png"),
  "clear-night": require("../assets/weather/clear-night.png"),
  "partly-cloudy-day": require("../assets/weather/partly-cloudy-day.png"),
  "partly-cloudy-night": require("../assets/weather/partly-cloudy-night.png"),
  cloudy: require("../assets/weather/cloudy.png"),
  "overcast-day": require("../assets/weather/overcast-day.png"),
  "overcast-night": require("../assets/weather/overcast-night.png"),
  drizzle: require("../assets/weather/drizzle.png"),
  "partly-cloudy-day-rain": require("../assets/weather/partly-cloudy-day-rain.png"),
  "partly-cloudy-night-rain": require("../assets/weather/partly-cloudy-night-rain.png"),
  rain: require("../assets/weather/rain.png"),
  "extreme-day-rain": require("../assets/weather/extreme-day-rain.png"),
  "extreme-night-rain": require("../assets/weather/extreme-night-rain.png"),
  "thunderstorms-day-rain": require("../assets/weather/thunderstorms-day-rain.png"),
  "thunderstorms-night-rain": require("../assets/weather/thunderstorms-night-rain.png"),
  wind: require("../assets/weather/wind.png"),
  thermometer: require("../assets/weather/thermometer.png"),
  humidity: require("../assets/weather/humidity.png"),
  raindrops: require("../assets/weather/raindrops.png"),
  sunrise: require("../assets/weather/sunrise.png"),
  sunset: require("../assets/weather/sunset.png"),
};

export function WxPic({ name, size = 32, style }: { name: WxPicName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={WX[name]} resizeMode="contain" style={[{ width: size, height: size }, style]} {...hidden} />;
}
