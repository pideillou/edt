import ScheduleModel from './models/ScheduleModel.js';
import ScheduleView from './views/ScheduleView.js';
import ScheduleController from './controllers/ScheduleController.js';
import IcsService from './services/IcsService.js';
import StorageService from './services/StorageService.js';

const storage = new StorageService('edt:');
const controller = new ScheduleController(
  new ScheduleModel(),
  new ScheduleView(document.querySelector('[data-app]')),
  new IcsService(storage),
  storage,
);
controller.start();

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Sans service worker, l'app marche quand même en ligne.
    });
  });
}
