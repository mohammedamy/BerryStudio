import { Component } from 'react'
export default class SceneBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return <div className="cl-error" role="alert"><h2>{this.props.lang === 'ar' ? 'تعذرت المعاينة' : 'The preview could not start'}</h2><p>{this.state.error.message}</p><p>{this.props.lang === 'ar' ? 'إعداد القطع والوصلات محفوظ. راجع الوصلات ثم أعد المحاولة.' : 'Your piece setup and joins are retained. Review the joins, then try again.'}</p><button onClick={this.props.onRecover}>{this.props.lang === 'ar' ? 'العودة إلى الوصلات' : 'Return to joins'}</button></div>
  }
}
