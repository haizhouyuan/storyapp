/* eslint-disable no-restricted-globals */
import { precacheAndRoute } from 'workbox-precaching';

// 这是Workbox需要的关键引用
precacheAndRoute(self.__WB_MANIFEST);

console.log('Simple Service Worker loaded');