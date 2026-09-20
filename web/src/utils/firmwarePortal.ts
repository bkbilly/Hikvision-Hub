export interface FirmwarePortalInfo {
  url: string;
  platform: string;
  isDirectMatch: boolean;
  folderPath: string;
}

/**
 * Resolves the firmware download directory on the Hikvision Europe portal (hikvisioneurope.com)
 * for a given camera model.
 *
 * Base Portal: https://www.hikvisioneurope.com/eu/portal/
 */
export function getFirmwarePortalInfo(model?: string): FirmwarePortalInfo {
  const m = (model || '').trim().toUpperCase();
  const baseUrl = 'https://www.hikvisioneurope.com/eu/portal/?dir=';

  if (!m) {
    const defaultPath = 'portal/Technical Materials/00  Network Camera/00  Product Firmware';
    return {
      url: `${baseUrl}${encodeURIComponent(defaultPath)}`,
      platform: 'Network Camera Firmware',
      isDirectMatch: false,
      folderPath: defaultPath,
    };
  }

  // 1. G5 Platform Panoramic G2P models (e.g., DS-2CD2387G2P, DS-2CD2T87G2P)
  if (/DS-2CD[23]\d{2}7G2P/i.test(m) || m.includes('2XX7G2P') || m.includes('3XX7G2P')) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/G5 Platform 2XX7G2P 3XX7G2P';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G5 Platform (2XX7G2P / 3XX7G2P)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 2. G5 Platform 2xxxG2(C) models (e.g., DS-2CD2T47G2-L, DS-2CD2347G2, DS-2CD2046G2, DS-2CD2386G2)
  if (
    /DS-2CD2\w{3}G2/i.test(m) ||
    m.includes('2T47G2') ||
    m.includes('2347G2') ||
    m.includes('2046G2') ||
    m.includes('2146G2') ||
    m.includes('2386G2') ||
    m.includes('2T86G2') ||
    m.includes('2686G2') ||
    m.includes('2746G2')
  ) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/G5 platform(2xx3G2 2xx6G2(C) 2xx7G2(C) 3xx6G2(C) 3xx7G2(C) 1x83G0)/01. (2xx3G2 2xx6G2(C) 2XX6G2H 2xx7G2(C) 2XX7G2H 3xx6G2(C) 3xx7G2(C) 1x83G0)/2xxxG2(C)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G5 Platform (2xxxG2)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 3. G5 Platform 3xx6G2 / 3xx7G2 (e.g., DS-2CD3046G2, DS-2CD3347G2)
  if (/DS-2CD3\w{3}G2/i.test(m) || m.includes('3XX6G2') || m.includes('3XX7G2')) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/G5 platform(2xx3G2 2xx6G2(C) 2xx7G2(C) 3xx6G2(C) 3xx7G2(C) 1x83G0)/01. (2xx3G2 2xx6G2(C) 2XX6G2H 2xx7G2(C) 2XX7G2H 3xx6G2(C) 3xx7G2(C) 1x83G0)/3xx6G2(C) 3XX6G2H';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G5 Platform (3xx6G2 / 3xx7G2)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 4. G5 Platform 1x83G0
  if (/DS-2CD1\w83G0/i.test(m) || m.includes('1X83G0')) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/G5 platform(2xx3G2 2xx6G2(C) 2xx7G2(C) 3xx6G2(C) 3xx7G2(C) 1x83G0)/01. (2xx3G2 2xx6G2(C) 2XX6G2H 2xx7G2(C) 2XX7G2H 3xx6G2(C) 3xx7G2(C) 1x83G0)/1x83G0';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G5 Platform (1x83G0)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 5. G1+M Platform (2xx6G1 models e.g., DS-2CD2T26G1, DS-2CD2T46G1, DS-2CD2326G1)
  if (/DS-2CD2\w{2}6G1/i.test(m) || m.includes('2XX6G1')) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/G1 Platform/G1+M platform (2XX6G1)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G1+M Platform (2XX6G1)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 6. G1 Platform (e.g., DS-2CD2T47G1-L, DS-2CD2347G1, DS-2CD2045FWD, DS-2CD2085FWD, DS-2CD2185FWD)
  if (
    /DS-2CD2\w{3}G1/i.test(m) ||
    /DS-2CD2\w{2}5/i.test(m) ||
    /DS-2CD3\w{2}[35]/i.test(m) ||
    m.includes('2T47G1') ||
    m.includes('2347G1') ||
    m.includes('2XX7G1')
  ) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/G1 Platform/G1 platform (DS-2CD2XX5 2XX3 2XX7G1 3XX3 3XX5 XM67X6)/2XX5 2XX3 2XX7G1 3XX5 3XX3 XM67X6non-Fisheye Multilanguage';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G1 Platform (2XX5 / 2XX3 / 2XX7G1)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 7. R6 Platform (e.g., DS-2CD2042WD-I, DS-2CD2142FWD, DS-2CD2T42WD, DS-2CD2022WD, 2X52, 64X4FWD, 1X31, 1X41)
  if (
    /DS-2CD2\w[24]2(FWD|WD)/i.test(m) ||
    /DS-2CD2\w52/i.test(m) ||
    /DS-2CD64\w4FWD/i.test(m) ||
    /DS-2CD1\w[34]1/i.test(m) ||
    m.includes('2042WD') ||
    m.includes('2142FWD') ||
    m.includes('2T42WD') ||
    m.includes('2X42FWD') ||
    m.includes('2X22FWD')
  ) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/R6 platform (2X22FWD, 2X42FWD, 2X52,64X4FWD,1X31,1X41)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'R6 Platform (2X22FWD / 2X42FWD)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 8. R2 Platform (e.g., DS-2CD2410F-IW, DS-2CD2010, DS-2CD2020, DS-2CD2110, DS-2CD1010, DS-2CD1021)
  if (
    /DS-2CD24\d0/i.test(m) ||
    /DS-2CD2\w[12]0/i.test(m) ||
    /DS-2CD1\w(10|02|21)/i.test(m) ||
    m.includes('2410') ||
    m.includes('2010') ||
    m.includes('2020') ||
    m.includes('2110') ||
    m.includes('2120')
  ) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/R2 platform (DS-2CD1x10,1X02,1X21,2xx0,2X14,4xx0, mobile IPC)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'R2 Platform (2xx0 / 2410 / 1x10)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 9. R0 Fisheye (DS-2CD2942F-I)
  if (m.includes('2942')) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/R0 Platform/R0 Fisheye(DS-2CD2942F-I(W)(S))';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'R0 Fisheye (2942)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 10. R0 Platform (older H.264 2xx2 models e.g., DS-2CD2012, DS-2CD2022, DS-2CD2032, DS-2CD2132)
  if (/DS-2CD2\w[123]2/i.test(m)) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/R0 Platform/R0 platform (2xx2)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'R0 Platform (2xx2)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 11. G0 Platform (e.g., DS-2CD1x43G0, DS-2CD1x53G0, DS-2CD2x47G3E, DS-2CD2x51G1-IDW)
  if (/DS-2CD1\w[45]3G0(?!E)/i.test(m) || m.includes('2X47G3E') || m.includes('247G3E') || m.includes('IDW')) {
    const path =
      "portal/Technical Materials/00  Network Camera/00  Product Firmware/G0 platform(1X43G0 1X53G0 2X47G3E 2X4'51G1-IDW1'2)";
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G0 Platform (1X43G0 / 1X53G0 / 2X47G3E)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 12. G3 Platform
  if (/DS-2CD[23]\w{3}G3/i.test(m) || m.includes('G3')) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/G3 Platform';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'G3 Platform',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 13. E7 Platform (1X43G0E)
  if (m.includes('G0E') || /DS-2CD1\w43G0E/i.test(m)) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/E7 platform (1X43G0E)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'E7 Platform (1X43G0E)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 14. E4 Platform (1X21, 1X31)
  if (/DS-2CD1\w[23]1/i.test(m)) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/E4 platform(1X21,1X31)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'E4 Platform (1X21 / 1X31)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 15. E3 Platform
  if (/DS-2CD1\w[12]3G0/i.test(m) || /DS-2CD2\w21G0/i.test(m)) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/E3 Platform';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'E3 Platform',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 16. E2 Platform
  if (/DS-2CD1\w01/i.test(m) || m.includes('6810')) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/E2 platform (DS-2CD1X01,IDS-2CD6810)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'E2 Platform',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 17. 4 Series ANPR
  if (m.includes('/P') || m.includes('ANPR')) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware/4 Series ANPR(DS-2CD4xxxx)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: '4 Series ANPR (DS-2CD4xxxx)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 18. R7 Platform (H.265 4X26EFWD)
  if (/DS-2CD4\w26EFWD/i.test(m) || m.includes('4A26EFWD')) {
    const path =
      'portal/Technical Materials/00  Network Camera/00  Product Firmware/R7 platform (H.265 4X26EFWD, 4BX6, 4CX6, 4DX6, 4A24FWD 20x, mobile IPC)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'R7 Platform (H.265 4X26EFWD)',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 19. PTZ Cameras
  if (m.startsWith('DS-2DE')) {
    const path = 'portal/Technical Materials/01  PTZ Camera/00  Product Firmware/00-R0 series(DS-2DExxxx)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'PTZ Camera (00-R0 series DS-2DE)',
      isDirectMatch: true,
      folderPath: path,
    };
  }
  if (m.startsWith('DS-2DF')) {
    const path = 'portal/Technical Materials/01  PTZ Camera/00  Product Firmware/01-R3 series(DS-2DFxxxx)';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'PTZ Camera (01-R3 series DS-2DF)',
      isDirectMatch: true,
      folderPath: path,
    };
  }
  if (m.startsWith('DS-2DY') || m.startsWith('DS-2DP') || m.startsWith('DS-2PT')) {
    const path = 'portal/Technical Materials/01  PTZ Camera/00  Product Firmware';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'PTZ Camera Firmware',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 20. NVRs
  if (/^(DS|IDS)-(76|77|96)\d{2}/i.test(m)) {
    const path = 'portal/Technical Materials/02  NVR/00  Product Firmware';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'NVR Product Firmware',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 21. DVRs
  if (/^(DS|IDS)-(71|72|73)\d{2}/i.test(m)) {
    const path = 'portal/Technical Materials/03  DVR/00  Product Firmware';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'DVR Product Firmware',
      isDirectMatch: true,
      folderPath: path,
    };
  }

  // 22. Generic Network Camera
  if (m.startsWith('DS-2CD') || m.startsWith('DS-2CV') || m.startsWith('IDS-2CD')) {
    const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware';
    return {
      url: `${baseUrl}${encodeURIComponent(path)}`,
      platform: 'Network Camera Firmware',
      isDirectMatch: false,
      folderPath: path,
    };
  }

  // Default Fallback
  const path = 'portal/Technical Materials/00  Network Camera/00  Product Firmware';
  return {
    url: `${baseUrl}${encodeURIComponent(path)}`,
    platform: 'Hikvision Europe Firmware Portal',
    isDirectMatch: false,
    folderPath: path,
  };
}
