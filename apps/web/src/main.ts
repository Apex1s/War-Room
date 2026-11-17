import { describePlatform } from '@warroom/ui';

const root = document.getElementById('root');
if (root) {
  root.textContent = describePlatform({ kind: 'web', authMode: 'anonymous+google' });
}
