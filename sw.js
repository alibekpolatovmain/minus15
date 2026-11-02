// Offline cache for the home-screen app. Bump CACHE_VERSION on every release.
const CACHE_VERSION = "minus15-v16";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./styles.css",
  "./js/app.js",
  "./js/data.js",
  "./js/plan.js",
  "./js/store.js",
  "./js/timer.js",
  "./js/ui.js",
  "./js/bodymap.js",
  "./js/forecast.js",
  "./js/dynamics.js",
  "./js/charts.js",
  "./js/results.js",
  "./img/Arm_Circles_0.jpg",
  "./img/Lateral_Lunge_0.jpg",
  "./img/Standing_Hip_Flexors_0.jpg",
  "./img/Standing_Hip_Flexors_1.jpg",
  "./img/Lateral_Lunge_1.jpg",
  "./img/Chin_Lift_0.jpg",
  "./img/Pushup_Incline_0.jpg",
  "./img/Pushup_Knee_0.jpg",
  "./img/Arm_Circles_1.jpg",
  "./img/Bird_Dog_0.jpg",
  "./img/Bodyweight_Squat_0.jpg",
  "./img/Bodyweight_Squat_1.jpg",
  "./img/Bodyweight_Walking_Lunge_0.jpg",
  "./img/Bodyweight_Walking_Lunge_1.jpg",
  "./img/Burpee_0.jpg",
  "./img/Burpee_1.jpg",
  "./img/Butt_Lift_Bridge_0.jpg",
  "./img/Butt_Lift_Bridge_1.jpg",
  "./img/Calf_Stretch_Hands_Against_Wall_0.jpg",
  "./img/Calf_Stretch_Hands_Against_Wall_1.jpg",
  "./img/Cat_Stretch_0.jpg",
  "./img/Cat_Stretch_1.jpg",
  "./img/Childs_Pose_0.jpg",
  "./img/Childs_Pose_1.jpg",
  "./img/Dead_Bug_0.jpg",
  "./img/Dead_Bug_1.jpg",
  "./img/Floor_Pushup_0.png",
  "./img/Floor_Pushup_1.png",
  "./img/Hindu_Pushups_0.jpg",
  "./img/Home_Squat_0.jpg",
  "./img/Home_Squat_1.jpg",
  "./img/Hug_Knees_To_Chest_0.jpg",
  "./img/Hug_Knees_To_Chest_1.jpg",
  "./img/Incline_Push-Up_0.jpg",
  "./img/Incline_Push-Up_1.jpg",
  "./img/Isometric_Neck_Exercise_-_Front_And_Back_0.jpg",
  "./img/Isometric_Neck_Exercise_-_Front_And_Back_1.jpg",
  "./img/Isometric_Neck_Exercise_-_Sides_0.jpg",
  "./img/Isometric_Neck_Exercise_-_Sides_1.jpg",
  "./img/Jumping_Jacks_0.jpg",
  "./img/Marching_High_Knees_0.jpg",
  "./img/Mountain_Climbers_0.jpg",
  "./img/Mountain_Climbers_1.jpg",
  "./img/One_Knee_To_Chest_0.jpg",
  "./img/One_Knee_To_Chest_1.jpg",
  "./img/Pike_0.jpg",
  "./img/Pike_1.jpg",
  "./img/Plank_0.jpg",
  "./img/Plank_1.jpg",
  "./img/Side_Bridge_0.jpg",
  "./img/Side_Bridge_1.jpg",
  "./img/Side_Neck_Stretch_0.jpg",
  "./img/Side_Neck_Stretch_1.jpg",
  "./img/Standing_Dumbbell_Calf_Raise_0.jpg",
  "./img/Standing_Dumbbell_Calf_Raise_1.jpg",
  "./img/Superman_0.jpg",
  "./img/Superman_1.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for the page (so updates arrive), cache-first for everything else.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
