/* eslint-disable no-restricted-syntax */
import zlib from 'zlib';
import { promises as fs } from 'fs';
import type {
  Schema,
  StatsPlaylistTypeData,
  AuthStringResolveable,
  DeviceAuthResolveable,
} from '../../resources/structs';

const defaultCharacters = [
  'CID_A_272_Athena_Commando_F_Prime',
  'CID_A_273_Athena_Commando_F_Prime_B',
  'CID_A_274_Athena_Commando_F_Prime_C',
  'CID_A_275_Athena_Commando_F_Prime_D',
  'CID_A_276_Athena_Commando_F_Prime_E',
  'CID_A_277_Athena_Commando_F_Prime_F',
  'CID_A_278_Athena_Commando_F_Prime_G',
  'CID_A_279_Athena_Commando_M_Prime',
  'CID_A_280_Athena_Commando_M_Prime_B',
  'CID_A_281_Athena_Commando_M_Prime_C',
  'CID_A_282_Athena_Commando_M_Prime_D',
  'CID_A_283_Athena_Commando_M_Prime_E',
  'CID_A_284_Athena_Commando_M_Prime_F',
  'CID_A_285_Athena_Commando_M_Prime_G',
];

export const makeCamelCase = (obj: { [key: string]: any }): any => {
  const returnObj: { [key: string]: any } = {};
  Object.keys(obj).forEach((k) => {
    returnObj[k.split('_').map((s, i) => (i > 0 ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s)).join('')] = obj[k];
  });
  return returnObj;
};

export const makeSnakeCase = (obj: { [key: string]: any }): any => {
  const returnObj: { [key: string]: any } = {};
  Object.keys(obj).forEach((k) => {
    returnObj[k.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)] = obj[k];
  });
  return returnObj;
};

export const getRandomDefaultCharacter = () => defaultCharacters[Math.floor(Math.random() * defaultCharacters.length)];

export const createPartyInvitation = (clientUserId: string, pingerId: string, data: any) => {
  const member = data.members.find((m: any) => m.account_id === pingerId);

  const partyMeta = data.meta;
  const memberMeta = member.meta;
  const meta: Schema = {
    'urn:epic:conn:type_s': 'game',
    'urn:epic:cfg:build-id_s': partyMeta['urn:epic:cfg:build-id_s'],
    'urn:epic:invite:platformdata_s': '',
  };

  if (memberMeta.Platform_j) {
    meta['Platform_j'] = JSON.parse(memberMeta.Platform_j).Platform.platformStr;
  }

  if (memberMeta['urn:epic:member:dn_s']) meta['urn:epic:member:dn_s'] = memberMeta['urn:epic:member:dn_s'];

  return {
    party_id: data.id,
    sent_by: pingerId,
    sent_to: clientUserId,
    sent_at: data.sent,
    updated_at: data.sent,
    expires_at: data.expies_at,
    status: 'SENT',
    meta,
  };
};

export const parseBlurlStream = (stream: Buffer) => new Promise<any>((res) => {
  zlib.inflate(stream.slice(8), (_err, buffer) => {
    const data = JSON.parse(buffer.toString());
    res(data);
  });
});

const parseM3U8FileLine = (line: string): [string, any] => {
  const [key, value] = line.replace(/^#EXT-X-/, '').split(/:(.+)/);

  let output: any;

  if (value!.includes(',')) {
    output = {};

    let store = '';
    let isString = false;
    for (const char of value!.split('')) {
      if (char === '"') {
        isString = !isString;
      } else if (char === ',' && !isString) {
        const [vK, vV] = store.split(/=(.+)/);
        output[vK!] = vV!.replace(/(^"|"$)/g, '');
        store = '';
      } else {
        store += char;
      }
    }
  } else {
    output = value;
  }

  return [key!, output];
};

export const parseM3U8File = (data: string) => {
  const output: any = {
    streams: [],
  };

  let streamInf;
  for (const line of data.split(/\n/).slice(1)) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      [, streamInf] = parseM3U8FileLine(line);
    } else if (line.startsWith('#EXT-X-')) {
      const [key, value] = parseM3U8FileLine(line);
      output[key] = value;
    } else if (!line.startsWith('#') && streamInf && line.length > 0) {
      output.streams.push({
        data: streamInf,
        url: line,
      });

      streamInf = undefined;
    }
  }

  return output;
};

const defaultStats = {
  score: 0,
  scorePerMin: 0,
  scorePerMatch: 0,
  wins: 0,
  top3: 0,
  top5: 0,
  top6: 0,
  top10: 0,
  top12: 0,
  top25: 0,
  kills: 0,
  killsPerMin: 0,
  killsPerMatch: 0,
  deaths: 0,
  kd: 0,
  matches: 0,
  winRate: 0,
  minutesPlayed: 0,
  playersOutlived: 0,
  lastModified: undefined,
};

export const createDefaultInputTypeStats = () => ({
  overall: { ...defaultStats },
  solo: { ...defaultStats },
  duo: { ...defaultStats },
  squad: { ...defaultStats },
  ltm: { ...defaultStats },
});

export const parseStatKey = (key: string, value: number): [keyof StatsPlaylistTypeData, (number | Date)] => {
  switch (key) {
    case 'lastmodified':
      return ['lastModified', new Date(value * 1000)];
    case 'placetop25':
      return ['top25', value];
    case 'placetop12':
      return ['top12', value];
    case 'placetop10':
      return ['top10', value];
    case 'placetop6':
      return ['top6', value];
    case 'placetop5':
      return ['top5', value];
    case 'placetop3':
      return ['top3', value];
    case 'placetop1':
      return ['wins', value];
    case 'playersoutlived':
      return ['playersOutlived', value];
    case 'minutesplayed':
      return ['minutesPlayed', value];
    case 'matchesplayed':
      return ['matches', value];
    default:
      return [key as keyof StatsPlaylistTypeData, value];
  }
};

export const resolveAuthString = async (str: AuthStringResolveable) => {
  switch (typeof str) {
    case 'function':
      return str();
    case 'string':
      if (str.length === 32 || str.startsWith('eg1')) {
        return str;
      }

      return fs.readFile(str, 'utf8');
    default:
      throw new TypeError(`The type "${typeof str}" does not resolve to a valid auth string`);
  }
};

export const resolveAuthObject = async (obj: DeviceAuthResolveable) => {
  switch (typeof obj) {
    case 'function':
      return obj();
    case 'string':
      return JSON.parse(await fs.readFile(obj, 'utf8'));
    case 'object':
      return obj;
    default:
      throw new TypeError(`The type "${typeof obj}" does not resolve to a valid auth object`);
  }
};

export const chunk = <T extends any>(array: T[], maxSize: number): T[][] => {
  const chunkedArray: T[][] = [];

  for (let i = 0; i < array.length; i += maxSize) {
    chunkedArray.push(array.slice(i, i + maxSize));
  }

  return chunkedArray;
};
