// Demo catalogue: real YouCam cloth-v4 renders produced during the Day-1 study,
// so judges can explore every flow without spending API units.

export interface DemoListing {
  id: string;
  shop: string;
  title: string;
  description: string;
  price: string;
  garment: string; // worn-outfit photo
}

export const LISTINGS: DemoListing[] = [
  {
    id: "abaya-sulam",
    shop: "Sopan demo store · TikTok Shop",
    title: "Abaya Sulam Mutiara — embroidered abaya, lengan panjang",
    description: "Abaya labuh with floral sulam embroidery on chest and sleeves. Lengan panjang with cuff. Moss crepe, tak jarang. Free size, fits up to XL.",
    price: "RM 129",
    garment: "/demo/garments/abaya-sulam.jpg",
  },
  {
    id: "abaya-belt",
    shop: "Sopan demo store · Shopee",
    title: "Classic Black Belted Abaya (fully lined)",
    description: "Maxi abaya with bell sleeve and contrast piping, self-tie belt. Fully lined nida fabric, opaque. Suitable for work and raya.",
    price: "RM 99",
    garment: "/demo/garments/abaya-belt.jpg",
  },
  {
    id: "lace-dress",
    shop: "Sopan demo store · Instagram",
    title: "Lace Sleeveless Party Dress",
    description: "Sleeveless lace dress with round neck, knee-length flared skirt. Sheer lace overlay.",
    price: "RM 79",
    garment: "/demo/garments/lace-dress.jpg",
  },
];

export interface DemoModel { id: string; name: string; photo: string; note: string }

export const MODELS: DemoModel[] = [
  { id: "aisyah", name: "Aisyah", photo: "/demo/models/aisyah.jpg", note: "Teal tudung" },
  { id: "nurul", name: "Nurul", photo: "/demo/models/nurul.jpg", note: "Satin bawal, tilted pose" },
  { id: "sara", name: "Sara", photo: "/demo/models/sara.jpg", note: "Loose white shawl" },
  { id: "amara", name: "Amara", photo: "/demo/models/amara.jpg", note: "Instant shawl + scarf" },
];

export const demoResult = (listingId: string, modelId: string, unmasked = false) =>
  `/demo/results/${listingId}/${modelId}${unmasked ? "-unmasked" : ""}.jpg`;

export const hasUnmasked = (listingId: string) => listingId !== "lace-dress";
