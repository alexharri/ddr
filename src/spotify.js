const SpotifyWebApi = require("spotify-web-api-node");

const redirectUri = "localhost:8080";

const spotify = new SpotifyWebApi({
  clientId: "b7e6e7cef1c74629ab74d4f89ec088c0",
  redirectUri,
});

const button = document.getElementById("spotify-access");

button.onclick = () => {
  const authorizeURL = spotify.createAuthorizeURL(["user-read-private"], "some-state");

  console.log({ authorizeURL });

  const newWindow = window.open(authorizeURL);
}

const getSong = (query) => new Promise((resolve, reject) => {
  spotify.searchTracks(query, { limit: 1 })
    .then((x) => spotify.getTrack(x.id))
    .then((track) => {
      console.log({ track });
    })
    .catch(err => console.error(err));
});

export default getSong;
