/** Punto de entrada. */

import './styles/tokens.css';
import './styles/base.css';
import { start } from './app';
import { startTour } from './tour';

document.getElementById('tour-button')?.addEventListener('click', startTour);
start();
