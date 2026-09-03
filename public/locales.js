const en={language:'Language',theme:'Color theme',system:'System',light:'Light',dark:'Dark',refresh:'Refresh',loading:'Loading',updated:'Updated',settings:'Settings',save:'Save settings',saved:'Settings saved',setup:'Setup',english:'English',dutch:'Nederlands',nav:'Dashboard sections',status:'Status'};
const nl={language:'Taal',theme:'Kleurthema',system:'Systeem',light:'Licht',dark:'Donker',refresh:'Vernieuw',loading:'Laden',updated:'Bijgewerkt',settings:'Instellingen',save:'Instellingen opslaan',saved:'Instellingen opgeslagen',setup:'Installatie',english:'English',dutch:'Nederlands',nav:'Dashboardonderdelen',status:'Status'};
export const dictionaries={en,nl};
export function initialLocale(){const saved=localStorage.getItem('arrsight-locale');return saved||(navigator.language?.toLowerCase().startsWith('nl')?'nl':'en');}
let locale=initialLocale();
export function setLocale(value,persist=true){locale=value==='nl'?'nl':'en';if(persist)localStorage.setItem('arrsight-locale',locale);document.documentElement.lang=locale;document.dispatchEvent(new CustomEvent('arrsight:locale',{detail:locale}));return locale;}
export function getLocale(){return locale;}
export function t(key){return dictionaries[locale]?.[key]??dictionaries.en[key]??key;}
export function translateDom(root=document){root.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});root.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));}
setLocale(locale,false);
