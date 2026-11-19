// Neon Bay — konfigurasi pusat.
// Satu-satunya sumber angka-angka dunia: ukuran kota, kecepatan, misi,
// hadiah, dan aturan wanted. Semua modul lain membaca dari sini.
(function () {
  'use strict';

  var C = {};

  // ---- Dunia ----
  C.worldHalf = 210;          // kota membentang x,z dalam [-210, 210]
  C.seaZ = 206;               // garis pantai: darat berakhir di z = 206
  C.pierZ = 209;              // koridor dermaga boleh sampai z = 209
  C.pierX0 = 143;             // koridor dermaga: x 143..157
  C.pierX1 = 157;
  C.groundY = 0;

  // ---- Pemain ----
  C.walkSpeed = 4.6;          // m/detik jalan kaki
  C.sprintSpeed = 8.5;        // m/detik lari (Shift)
  C.playerRadius = 0.6;
  C.maxHealth = 100;
  C.deathFine = 150;          // denda WASTED / BUSTED ($)
  C.spawn = { x: 0, z: 120 }; // garasi = titik awal + titik pulang misi

  // ---- Mobil ----
  C.carAccel = 12;            // m/detik^2
  C.carTopSpeed = 28;         // m/detik maju
  C.carReverseSpeed = 10;
  C.carTurnRate = 1.9;        // rad/detik
  C.carEnterRadius = 8;       // jarak E untuk masuk mobil
  C.trafficCount = 10;
  C.parkedCount = 8;
  C.pedCount = 16;

  // ---- Polisi & wanted ----
  C.maxWanted = 5;
  C.policeTopSpeed = 22;
  C.policeAccel = 8;
  C.policeSpawnDist = 70;     // jarak spawn mobil polisi dari pemain (jalan kaki)
  C.policeSpawnDistCar = 130;  // jarak spawn saat pemain di mobil (mobil cepat, polisi butuh ancang-ancang)
  C.policeDispatchDelay = 2;  // jeda sebelum mobil polisi mulai bergerak
  C.bustDist = 5;             // jarak tangkap
  C.bustSpeed = 3;            // pemain harus lebih lambat dari ini untuk ditangkap
  C.bustTime = 4;             // detik kontak sampai BUSTED
  C.policeContactDps = 4;     // damage tabrakan polisi ke pemain jalan kaki
  C.wantedDecaySeconds = 20;  // 1 bintang hilang tiap 20 dtk tanpa polisi dekat
  C.wantedDecayDist = 45;     // "tanpa polisi dekat" = semua polisi > 45 m
  C.wantedDecayGrace = 5;     // jeda setelah kejahatan terakhir sebelum decay jalan

  // ---- Musuh ----
  C.thugHp = 3;
  C.thugCount = 3;
  C.thugChaseDist = 35;       // thug mengejar bila pemain < 35 m
  C.thugSpeed = 3.5;
  C.thugDamage = 5;
  C.punchRange = 2.6;
  C.punchDamage = 2;   // tinju 2 damage (preman 3 HP mati dalam 2 pukulan)
  C.gunDamage = 1;

  // ---- Kamera ----
  C.camDist = 9;              // jarak kamera default
  C.camPitch = 0.32;          // sudut kamera default (rad)
  C.camMinDist = 5;
  C.camMaxDist = 20;
  C.camLerp = 0.12;           // k per frame (posisi + yaw halus)
  C.camYawDecay = 2.0;        // orbit kamera kembali ke belakang pemain (/dtk)

  // ---- Beacon (tiang cahaya penunjuk objektif) ----
  C.beaconHeight = 260;
  C.beaconTopR = 7;
  C.beaconBottomR = 9;
  C.beaconColor = 0xffb300;   // emas pekat
  C.beaconOpacity = 0.85;
  C.beaconFadeNear = 12;      // kamera <= 12 m dari tiang -> opacity 0
  C.beaconFadeFar = 47;       // kamera >= 47 m -> opacity penuh

  // ---- Minimap ----
  C.mapSize = 168;            // canvas 168x168
  C.mapRadius = 84;
  C.mapRange = 210;           // dunia +/-210 m dipetakan ke radius 84 px

  // ---- Lokasi kunci ----
  C.garage = { x: 0, z: 120 };        // markas / titik pulang
  C.bank = { x: -58, z: -64, w: 22, d: 14 }; // gedung bank (pickup di depannya)
  C.bankPickup = { x: -70, z: -54 };  // pickup misi 6: DI LUAR gedung
  C.hospital = { x: 140, z: 140 };    // titik respawn WASTED/BUSTED
  C.pier = { x: 150, z: 196 };        // dermaga selatan (pickup misi 1 & 5)
  C.buyer = { x: 0, z: -150 };        // pembeli misi 2 (sisi utara)
  C.starterCar = { x: 10, z: 144 };   // mobil starter pink dekat garasi

  // ---- Misi (6, berantai) ----
  // stage: nama tahap; phase getter NBMissions mengembalikan stage ini.
  C.missions = [
    {
      title: 'JOB 1: FIRST PICKUP',
      brief: 'Ambil paket di dermaga selatan, lalu kembali ke garasi.',
      reward: 200,
      stages: [
        { name: 'toPier', text: 'Pergi ke dermaga selatan', target: { x: 150, z: 196 }, radius: 8.5 },
        { name: 'pickup', text: 'Paket diamankan!', target: null, radius: 0, hold: 0.8 },
        { name: 'toHome', text: 'Kembali ke garasi', target: { x: 0, z: 120 }, radius: 24 },
      ],
    },
    {
      title: 'JOB 2: HOT DELIVERY',
      brief: 'Naik mobil dan antar paket ke pembeli di utara. Batas 100 detik!',
      reward: 350,
      timer: 100,
      stages: [
        { name: 'pickup', text: 'Naik mobil apa saja', target: null, radius: 0, needCar: true },
        { name: 'toBuyer', text: 'Antar ke pembeli di utara', target: { x: 0, z: -150 }, radius: 10 },
      ],
    },
    {
      title: 'JOB 3: BORROWED WHEELS',
      brief: 'Curi sebuah mobil dan bawa ke garasi.',
      reward: 400,
      stages: [
        { name: 'steal', text: 'Curi sebuah mobil (E untuk masuk)', target: null, radius: 0, needCar: true },
        { name: 'toHome', text: 'Bawa mobil ke garasi', target: { x: 0, z: 120 }, radius: 24 },
      ],
    },
    {
      title: 'JOB 4: LOSE THE HEAT',
      brief: 'Polisi mengejarmu (2 bintang). Menjauhlah lebih dari 45 meter dari semua mobil polisi dan bertahan sampai bintang hilang.',
      reward: 500,
      wanted: 2,
      stages: [
        { name: 'loseheat', text: 'Jauhi polisi sampai bintang hilang', target: null, radius: 0 },
      ],
    },
    {
      title: 'JOB 5: DOCKSIDE TROUBLE',
      brief: 'Ambil pistol, lalu kalahkan 3 preman di dermaga. Tinju atau tembak.',
      reward: 600,
      stages: [
        { name: 'fight', text: 'Kalahkan 3 preman di dermaga', target: { x: 150, z: 196 }, radius: 8.5 },
      ],
    },
    {
      title: 'JOB 6: THE BIG ONE',
      brief: 'Rampok bank: ambil uang di depan pintu bank, lalu kabur ke garasi dengan wanted 0. Batas 240 detik!',
      reward: 1500,
      timer: 240,
      stages: [
        { name: 'toBank', text: 'Pergi ke bank', target: { x: -70, z: -54 }, radius: 8 },
        { name: 'escape', text: 'Kabur ke garasi dengan wanted 0', target: { x: 0, z: 120 }, radius: 24, needWantedZero: true },
      ],
    },
  ];

  // Jalan: garis-garis vertikal/horizontal tempat lalu lintas berjalan.
  C.verticalRoads = [-160, -80, -35, 0, 35, 80, 160];
  C.horizontalRoads = [-160, -80, 0, 80, 160];

  window.NB_CONFIG = C;
})();
