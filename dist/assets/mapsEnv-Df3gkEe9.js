import{c as n}from"./createLucideIcon-B61QJqIL.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const i=[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["path",{d:"m21 21-4.3-4.3",key:"1qie3q"}]],u=n("search",i),o="rutasegura-maps",r=/^(YOUR_|your_|xxx|changeme|api[_-]?key|placeholder|example)/i;function _(){const e=String("AIzaSyCfaPUzjLuxflaewqHltryE_cRhaiNgR1s").trim();if(e.length!==0&&!(r.test(e)||!e.startsWith("AIza")))return e}function f(){const e=String("AIzaSyCfaPUzjLuxflaewqHltryE_cRhaiNgR1s").trim();return e.length>0&&(r.test(e)||!e.startsWith("AIza"))}const c=["places","geometry"],s={version:"weekly",language:"es",libraries:c},a=new Map;function g(t){return{id:o,googleMapsApiKey:t,...s}}function p(t){let e=a.get(t);return e||(e=g(t),a.set(t,e)),e}const y={id:o,googleMapsApiKey:"",...s};export{y as G,u as S,p as a,_ as g,f as h};
