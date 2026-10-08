/**
 * The photographs behind the screen heroes, bundled with the app (about 100 KB
 * each, 1024 px wide, metadata stripped) so they show offline and never cost a
 * farmer data. All are openly licensed; CREDITS lists author, licence and source,
 * and every hero shows its credit. Found through Openverse (openverse.org).
 */
import type { ImageSourcePropType } from "react-native";

export type PhotoKey = "farm" | "doctor" | "chat" | "markets" | "fish" | "sacco" | "nursery" | "autopilot" | "login" | "livestock";
export type Photo = { src: ImageSourcePropType; alt: { en: string; sw: string }; credit: string; license: string; licenseUrl: string; source: string; focusY: number };

export const PHOTOS: Record<PhotoKey, Photo> = {
  farm: {
    src: require("../assets/photos/farm.jpg"),
    alt: { en: "A farmer weeding a green hillside field in Kenya", sw: "Mkulima akipalilia shamba la kijani mlimani, Kenya" },
    credit: "CIAT",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    source: "https://www.flickr.com/photos/38476503@N08/5366719785",
    focusY: 0.45,
  },
  doctor: {
    src: require("../assets/photos/doctor.jpg"),
    alt: { en: "A farmer inspecting a crop plant in Kenya", sw: "Mkulima akikagua mmea shambani, Kenya" },
    credit: "CIAT",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    source: "https://www.flickr.com/photos/38476503@N08/5367352990",
    focusY: 0.35,
  },
  chat: {
    src: require("../assets/photos/chat.jpg"),
    alt: { en: "A smiling farmer on her mobile phone in a field in Kenya", sw: "Mkulima akitabasamu akiongea kwa simu shambani, Kenya" },
    credit: "CIAT",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    source: "https://www.flickr.com/photos/38476503@N08/5367331640",
    focusY: 0.3,
  },
  markets: {
    src: require("../assets/photos/markets.jpg"),
    alt: { en: "Bunches of bananas piled for sale at a market in Kenya", sw: "Mikungu ya ndizi ikiuzwa sokoni, Kenya" },
    credit: "CIAT",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    source: "https://www.flickr.com/photos/38476503@N08/5367353434",
    focusY: 0.5,
  },
  fish: {
    src: require("../assets/photos/fish.jpg"),
    alt: { en: "Farmers netting fish in an earthen fish pond", sw: "Wakulima wakivua samaki kwenye bwawa la udongo" },
    credit: "USAID Mozambique",
    license: "Public domain",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
    source: "https://www.flickr.com/photos/62256332@N08/54340083880",
    focusY: 0.55,
  },
  sacco: {
    src: require("../assets/photos/sacco.jpg"),
    alt: { en: "Three women farmers of a farmers' group, laughing in a maize field", sw: "Wakulima wanawake watatu wa kikundi wakicheka kwenye shamba la mahindi" },
    credit: "CDKNetwork",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    source: "https://www.flickr.com/photos/52797059@N06/8559494060",
    focusY: 0.3,
  },
  nursery: {
    src: require("../assets/photos/nursery.jpg"),
    alt: { en: "Young seedlings in polythene sleeves at a roadside nursery", sw: "Miche michanga kwenye mifuko ya plastiki kwenye kitalu cha barabarani" },
    credit: "whiteafrican",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    source: "https://www.flickr.com/photos/18288598@N00/901403155",
    focusY: 0.55,
  },
  autopilot: {
    src: require("../assets/photos/autopilot.jpg"),
    alt: { en: "Bananas carried to market on a motorbike along a Kenyan road", sw: "Ndizi zikipelekwa sokoni kwa pikipiki barabarani, Kenya" },
    credit: "CIAT",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    source: "https://www.flickr.com/photos/38476503@N08/5366743581",
    focusY: 0.5,
  },
  login: {
    src: require("../assets/photos/login.jpg"),
    alt: { en: "A smiling tea farmer with a basket of picked leaves in Kenya", sw: "Mkulima wa chai akitabasamu na kikapu cha majani, Kenya" },
    credit: "CIAT",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    source: "https://www.flickr.com/photos/38476503@N08/5367333630",
    focusY: 0.35,
  },
  livestock: {
    src: require("../assets/photos/livestock.jpg"),
    alt: { en: "Cows grazing by a red murram road in Kenya", sw: "Ng'ombe wakila nyasi kando ya barabara ya udongo mwekundu, Kenya" },
    credit: "GlassWorkshop",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    source: "https://www.flickr.com/photos/39763220@N02/4299760313",
    focusY: 0.6,
  },
};

export const PHOTO_KEYS = Object.keys(PHOTOS) as PhotoKey[];
/** "Photo: CIAT · CC BY-SA 2.0" */
export const creditLine = (p: Photo) => `${p.credit} · ${p.license}`;
