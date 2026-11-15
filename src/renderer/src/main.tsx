import ReactDOM from 'react-dom/client'
import App from './App'
import 'katex/dist/katex.min.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/sidebar.css'
import './styles/editor.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
