import React from "react";

import {
  LogOutButton,
  trackHeightAsCssVar,
  isMobileNavMenuOpen,
} from "../components/PageComponents";

export default class GeoDashNavigationBar extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      addDialog: false,
      copyDialog: false,
    };
    this.navRef = React.createRef();
  }

  componentDidMount() {
    this.stopTrackingNavHeight = trackHeightAsCssVar(this.navRef.current, "--navbar-height", {
      ignore: isMobileNavMenuOpen,
    });
  }

  componentWillUnmount() {
    if (this.stopTrackingNavHeight) this.stopTrackingNavHeight();
  }

  closeDialogs = () =>
    this.setState({
      addDialog: false,
      copyDialog: false,
    });

  render() {
    const { userName, page, visiblePlotId, editor } = this.props;
    const uri = window.location.pathname;

    return (
      <>
        <nav
          className="navbar navbar-expand-lg fixed-top py-1"
          id="geodash-nav"
          ref={this.navRef}
          style={{
            backgroundColor: "rgba(6, 8, 6, 0.95)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(14px)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          }}
        >
          <a
            className="navbar-brand d-flex align-items-center pt-1 pb-1"
            href="home"
            style={{ gap: "10px", textDecoration: "none" }}
          >
            <img
              alt="INAB"
              src="https://manejoforestal.inab.gob.gt/img/inab.png"
              style={{ height: "36px", objectFit: "contain" }}
            />
            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "1.05rem", letterSpacing: "0.02em" }}>
              INAB <span style={{ color: "#10b981" }}>· SIG</span>
            </span>
          </a>
          <button
            className="navbar-toggler"
            data-target="#navbarSupportedContent"
            data-toggle="collapse"
            type="button"
            style={{ borderColor: "rgba(255, 255, 255, 0.2)" }}
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div
            className="collapse navbar-collapse justify-content-between"
            id="navbarSupportedContent"
          >
            <div className="d-flex align-items-center" style={{ gap: "12px" }}>
              <span
                style={{
                  color: "#9ed999",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                }}
              >
                Geo-Dash
              </span>
            </div>
            <ul className="navbar-nav" style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", gap: "8px" }}>
              {editor ? (
                <>
                  <li className="nav-item my-auto ml-1">
                    <button
                      alt="This will remove any existing widgets currently configured."
                      className="btn outline"
                      style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                      onClick={() => this.setState({ copyDialog: true })}
                      title="This will remove any existing widgets currently configured."
                      type="button"
                    >
                      Copiar Diseño
                    </button>
                  </li>
                  <li className="nav-item my-auto ml-1">
                    <button
                      className="btn filled"
                      style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                      onClick={() => this.setState({ addDialog: true })}
                      type="button"
                    >
                      Añadir Widget
                    </button>
                  </li>
                </>
              ) : (
                <li className="nav-item d-flex align-items-center justify-content-center" style={{ flex: 1 }}>
                  <span
                    style={{
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#a7f3d0",
                      padding: "5px 14px",
                      borderRadius: "8px",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      letterSpacing: "0.03em",
                    }}
                  >
                    Parcela #{visiblePlotId}
                  </span>
                </li>
              )}
              <li className="nav-item my-auto ml-1">
                <button
                  className="btn outline"
                  style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                  onClick={() => window.open("geo-dash-help", "_blank")}
                  type="button"
                >
                  Ayuda Geo-Dash
                </button>
              </li>
              <LogOutButton uri={uri} userName={userName} />
            </ul>
          </div>
        </nav>
        {page(this.state.addDialog, this.state.copyDialog, this.closeDialogs)}
      </>
    );
  }
}
