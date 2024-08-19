// Firebaseモジュールのインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, get, ref, push, set, onChildAdded, remove, update, onChildChanged, onChildRemoved, query, orderByChild } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// 改行を <br> に変換する関数
function nl2br(str) {
    return str.replace(/\n/g, '<br>');
}

// <br> を改行に変換する関数
function br2nl(str) {
    return str.replace(/<br>/g, '\n');
}

// 現在の日時をフォーマットして返す関数
function getFormattedDate() {
    const now = new Date();
    const pad = num => num.toString().padStart(2, '0');
    return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Firebaseの初期化とチャットアプリの設定
async function initializeChatApp() {
    const firebaseConfig = await fetch('firebaseConfig.json').then(response => response.json());
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getDatabase(app);
    const dbRef = ref(db, "chat");

    let updateKey = null;
    let deleteKey = null;

    // Google認証プロバイダ
    const provider = new GoogleAuthProvider();

    // Googleログイン処理
    document.getElementById('login').addEventListener('click', () => {
        signInWithPopup(auth, provider)
            .then(async (result) => {
                const user = result.user;
                document.getElementById('uname').value = user.displayName;
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('chat-screen').style.display = 'flex';

                // ユーザー情報をデータベースに保存または更新
                const userRef = ref(db, 'users/' + user.uid);
                const userSnapshot = await get(userRef);
                if (userSnapshot.exists()) {
                    const existingData = userSnapshot.val();
                    if (existingData.uname !== user.displayName) {
                        await update(userRef, { uname: user.displayName });
                        console.log('ユーザー名を更新しました:', user.displayName);
                    }
                } else {
                    await set(userRef, {
                        uid: user.uid,
                        uname: user.displayName,
                        photoURL: user.photoURL
                    });
                    console.log('ユーザー情報を保存しました:', user.displayName);
                }
            })
            .catch((error) => {
                console.error(error);
            });
    });

    // 認証状態の変化を監視
    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.getElementById('uname').value = user.displayName;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('chat-screen').style.display = 'flex';
        } else {
            document.getElementById('chat-screen').style.display = 'none';
            document.getElementById('login-screen').style.display = 'flex';
        }
    });

    // ログアウト処理
    document.getElementById('logout').addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log('User signed out');
            document.getElementById('chat-screen').style.display = 'none';
            document.getElementById('login-screen').style.display = 'flex';
        }).catch((error) => {
            console.error(error);
        });
    });

    // データ登録(クリック)
    $("#send").on("click", async function() {
        const user = auth.currentUser;
        const userRef = ref(db, 'users/' + user.uid);
        const userSnapshot = await get(userRef);
        const uname = userSnapshot.val().uname;
        const uid = user.uid;
        const text = $("#text").val().trim();
        if (text === "") {
            alert("メッセージを入力してください。");
            return;
        }
        const timestamp = getFormattedDate();
        const msg = { uname, uid, text, timestamp };
        const newPostRef = push(dbRef);
        set(newPostRef, msg);
        $("#text").val("");
    });

    // データ登録(Enterキー)
    $("#text").on("keydown", async function(e){
        if(e.keyCode == 13 && !e.shiftKey){
            e.preventDefault();
            const user = auth.currentUser;
            const userRef = ref(db, 'users/' + user.uid);
            const userSnapshot = await get(userRef);
            const uname = userSnapshot.val().uname;
            const uid = user.uid;
            const text = $("#text").val().trim();
            if (text === "") {
                alert("メッセージを入力してください。");
                return;
            }
            const timestamp = getFormattedDate();
            const msg = { uname, uid, text, timestamp };
            const newPostRef = push(dbRef);
            set(newPostRef, msg);
            $("#text").val("");
        }
    });

    // データ更新(小型ウィンドウからの保存)
    $("#editSave").on("click", function() {
        const text = $("#editText").val().trim();
        if (text === "") {
            alert("メッセージを入力してください。");
            return;
        }
        if (updateKey) {
            const updatedMsg = { text, edited: true };
            const updateRef = ref(db, "chat/" + updateKey);
            update(updateRef, updatedMsg).then(() => {
                // 画面上のメッセージを更新
                $("#" + updateKey + " .msg-text").html(nl2br(updatedMsg.text));
                // 「編集済」を即時反映
                if ($("#" + updateKey + " .edited").length === 0) {
                    $("#" + updateKey).append('<span class="edited">編集済</span>');
                }
                $("#editWindow").hide();
            });
        }
    });

    // 編集ウィンドウをキャンセル
    $("#editCancel").on("click", function() {
        updateKey = null;
        $("#editWindow").hide();
    });

    // 削除確認ポップアップのキャンセル
    $("#deleteConfirmNo").on("click", function() {
        deleteKey = null;
        $("#deleteConfirm").hide();
    });

    // 削除確認ポップアップの確認
    $("#deleteConfirmYes").on("click", function() {
        if (deleteKey) {
            const deleteRef = ref(db, "chat/" + deleteKey);
            remove(deleteRef).then(() => {
                deleteKey = null;
                $("#deleteConfirm").hide();
            });
        }
    });

    // 他のユーザーの情報を取得する関数
    async function getUserInfo(uid) {
        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);
        return userSnapshot.exists() ? userSnapshot.val() : null;
    }

    // 最初にデータ取得＆onSnapshotでリアルタイムにデータを取得
    const chatQuery = query(dbRef, orderByChild('timestamp'));
    onChildAdded(chatQuery, async function(data){   
        const msg = data.val();
        const key = data.key;
        const user = auth.currentUser;
        const isSelf = user && user.uid === msg.uid;
        const bubbleClass = isSelf ? 'chat-bubble self' : 'chat-bubble other';
        let h = `<div id="${key}" class="${bubbleClass}">`;
        if (!isSelf) {
            const userInfo = await getUserInfo(msg.uid);
            if (userInfo && userInfo.photoURL) {
                h += `<img src="${userInfo.photoURL}" alt="icon">`;
            }
            h += `<div>`;
            h += `<p class="uname">${userInfo ? userInfo.uname : msg.uname}</p>`;
        } else {
            h += `<div>`;
            h += `<p class="uname">${msg.uname}</p>`;
        }
        h += `<p class="msg-text">${nl2br(msg.text)}</p>`;
        h += `<span class="timestamp">${msg.timestamp}</span>`;
        if (msg.edited) {
            h += `<span class="edited">編集済</span>`;
        }
        if (isSelf) {
            h += `<button onclick="editMessage('${key}')">編集</button>`;
            h += `<button onclick="confirmDelete('${key}')">削除</button>`;
        }
        h += `</div></div>`;
        $("#output").append(h);
        $('#output').animate( {scrollTop: ($('#output')[0].scrollHeight)}, 10 );
    });

    // データ変更時に画面を更新
    onChildChanged(chatQuery, function(data) {
        const msg = data.val();
        const key = data.key;
        $("#" + key + " .msg-text").html(nl2br(msg.text));
        if (msg.edited && $("#" + key + " .edited").length === 0) {
            $("#" + key).append('<span class="edited">編集済</span>');
        }
    });

    // データ削除時に画面を更新
    onChildRemoved(chatQuery, function(data) {
        const key = data.key;
        $("#" + key).remove();
    });

    // メッセージの編集
    window.editMessage = function(key) {
        const uname = $("#" + key + " .uname").text();
        const text = $("#" + key + " .msg-text").html();
        $("#editUname").val(uname);
        $("#editText").val(br2nl(text));
        updateKey = key;
        $("#editWindow").show();
    };

    // メッセージの削除確認
    window.confirmDelete = function(key) {
        const uname = $("#" + key + " .uname").text();
        const text = $("#" + key + " .msg-text").text();
        const truncatedText = text.length > 60 ? text.substring(0, 60) + '...' : text;
        $("#deleteMessage").html(`名前: ${uname}<br>メッセージ: ${truncatedText}`);
        deleteKey = key;
        $("#deleteConfirm").show();
    };
}

// チャットアプリの初期化を呼び出す
initializeChatApp();