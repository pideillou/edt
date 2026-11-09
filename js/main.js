import ScheduleModel from './models/ScheduleModel.js';
import ScheduleView from './views/ScheduleView.js';
import ScheduleController from './controllers/ScheduleController.js';
import RoomsModel from './models/RoomsModel.js';
import RoomsView from './views/RoomsView.js';
import RoomsController from './controllers/RoomsController.js';
import IcsService from './services/IcsService.js';
import StorageService from './services/StorageService.js';

const storage = new StorageService('edt:');
const ics = new IcsService(storage);

const controller = new ScheduleController(
  new ScheduleModel(),
  new ScheduleView(document.querySelector('[data-app]')),
  ics,
  storage,
);
controller.start();

// Fenêtre « Salles libres » : son propre trio modèle, vue, contrôleur.
new RoomsController(new RoomsModel(), new RoomsView(document), ics);

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Sans service worker, l'app marche quand même en ligne.
    });
  });
}
